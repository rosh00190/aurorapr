
return class DynamicMenu {
    /**
     * [신규] 반복 사용되는 문자열을 상수로 관리하여 유지보수성 향상.
     * STscript의 민감성을 고려하여, 기존 코드에서 사용된 문자열과 100% 동일하게 정의합니다.
     */
    static CONSTANTS = {
        LABELS: {
            RETURN_TO_MAIN: '↩️ 목록으로 돌아가기',
            RETURN_TO_SETTINGS: '↩️ 이전 메뉴로 돌아가기',
            CANCEL_SELECTION: '❌ 선택이 취소되었습니다.',
            CANCEL_INPUT: '❌ 입력이 취소되었습니다.',
            CANCEL_DELETE: '❌ 삭제가 취소되었습니다.',
            CANCEL_CUSTOM_INPUT: '❌ 커스텀 상황 입력이 취소되었습니다.',
            CANCEL_SUB_CONTENT_SELECTION: '❌ 세부 컨텐츠 선택이 취소되었습니다.',
        }
    };

    /**
     * @param {object} staticDeps - 스크립트 실행 동안 변하지 않는 고정 의존성(헬퍼 함수 등)
     */
    constructor(staticDeps) {
        this.deps = staticDeps; // logger, getProxiedUrl 등
        this.menuConfig = null; // YAML 파싱 결과 저장
        this.bookmarks = []; // 북마크 배열 저장
        this.charName = ''; // 현재 캐릭터 이름 저장
    }

        /**
         * [임시] 항상 최신 캐릭터 이름을 보장하기 위한 내부 헬퍼 함수. (참조 코드 기반 최종 수정)
         * 우선순위: (1) 빠른 실행 전용 글로벌 변수 -> (2) DOM 탐색 -> (3) 기존 인자값
         * @param {string} currentName - 현재 함수에 전달된 (오래되었을 수 있는) 캐릭터 이름
         * @returns {Promise<string>} - 확인된 최신 캐릭터 이름
         */
        async _ensureLatestCharInfo(currentName) {
            const { logger, getVariables, triggerSlash } = this.deps;
            
            // 1. (최우선) 빠른 실행 시에만 사용되는 1회성 글로벌 변수를 확인합니다.
            const globalVars = await getVariables({ type: 'global' });
            if (globalVars && globalVars.orora_quick_char_name) {
                const charNameFromGlobal = globalVars.orora_quick_char_name;
                logger.debug(`[임시] 글로벌 변수 'orora_quick_char_name'에서 '${charNameFromGlobal}'(을)를 확인했습니다.`);
                await triggerSlash('/flushglobalvar orora_quick_char_name'); // 사용 후 즉시 제거
                return charNameFromGlobal;
            }

            // 2. (차선책) DOM에서 현재 보이는 캐릭터 이름을 직접 탐색합니다. (제공된 코드 로직을 그대로 사용)
            try {
                // 'parent.document'를 사용해 스크립트가 iframe 내에서 실행되더라도 전체 문서를 탐색합니다.
                const charNameElement = parent.document.querySelector('.mes[is_user="false"] .ch_name .name_text');
                
                // nameElement가 존재하고, 그 내용(textContent)이 비어있지 않은지 확인합니다.
                if (charNameElement && charNameElement.textContent && charNameElement.textContent.trim()) {
                    const charNameFromDOM = charNameElement.textContent.trim();
                    if (charNameFromDOM !== currentName && currentName !== '') { // 초기 호출이 아닐 때만 로그를 남김
                         logger.debug(`[임시] DOM 탐색을 통해 캐릭터 이름이 '${currentName}' -> '${charNameFromDOM}'(으)로 갱신되었습니다.`);
                    } else if (currentName === '') {
                        logger.debug(`[임시] DOM 탐색을 통해 캐릭터 이름 '${charNameFromDOM}'(을)를 확인했습니다.`);
                    }
                    return charNameFromDOM;
                }
            } catch(e) {
                 logger.warn('[임시] DOM 탐색 중 오류가 발생했습니다.', e);
            }

            // 3. (안전장치) 위 방법들이 모두 실패하면, 기존에 받은 이름을 그대로 반환합니다.
            logger.debug(`[임시] 추가적인 캐릭터 정보 갱신 없이 기존 이름 '${currentName}'(을)를 사용합니다.`);
            return currentName;
        }
		
    /**
     * [공개 메서드 1] 메뉴 UI 생성 및 표시
     * 사용자가 버튼을 클릭했을 때 호출됩니다.
     * @param {object} runtimeDeps - 실행 시점에 결정되는 동적 데이터 (예: charName)
     */
    async run(runtimeDeps) {
        //this.charName = runtimeDeps.charName;
		this.charName = await this._ensureLatestCharInfo(runtimeDeps.charName);
        const { logger } = this.deps;
        try {
            // 메뉴 생성에 필요한 데이터(YAML, 북마크)를 불러옵니다.
            await this.#loadDataAndParse();
            // 데이터를 기반으로 메뉴 UI를 구성하는 STscript를 조립합니다.
            const stscriptCommand = this.#buildMenuScriptBlocks();
            
                logger.group("✅ 동적으로 생성된 '메뉴 표시용' 스크립트 (클릭하여 펼치기):", stscriptCommand);
                
            
            // 완성된 메뉴 UI 스크립트를 실행합니다.
            await this.deps.triggerSlash(stscriptCommand);
        } catch (error) {
            logger.error('DynamicMenu.run 실행 중 오류 발생:', error);
            toastr.error('메뉴 UI 생성 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
        }
    }

    async triggerQuickAction() {
        const { logger, getVariables } = this.deps;
        
        try {
            const lastAction = getVariables({ type: 'global' }).orora_selected_file;

        // 1. 마지막 실행 기록이 없는 경우 (Case 4)
            if (!lastAction) {
                toastr.info('🚀 마지막 실행 기록이 없습니다.');
                return;
            }

			this.charName = await this._ensureLatestCharInfo('');

        // 2. processAction이 이해할 수 있는 형태로 변환
            let actionString;
            const isCustomCommand = lastAction.trim().startsWith('<request_custom_content>');

            if (isCustomCommand) {
            // 2-1. 이미 커스텀 입력 형태인 경우 그대로 사용 (Case 1, 2)
                actionString = lastAction;
            } 
            else {
            // 2-2. 파일 경로만 있는 경우, LOAD_FILE 구문으로 시뮬레이션 (Case 3)
                actionString = `<request_custom_content> ## LOAD_FILE::${lastAction}.txt`;
            }

        // 3. 변환된 actionString으로 processAction 실행
            // 수정된 processAction을 호출합니다.
            await this.processAction(actionString);

        } catch (error) {
            logger.error('빠른 실행 처리 중 오류 발생:', error);
            toastr.error('빠른 실행 중 오류가 발생했습니다.');
        }
    }
    async processAction(input) {
        const { logger, triggerSlash } = this.deps;
        try {
            let actionString;

            // --- 시작: 인자 타입 체크 (하위 호환성 지원) ---
            // 인자가 문자열이면, 새로운 방식의 호출(빠른 실행 등)로 간주합니다.
            if (typeof input === 'string') {
                actionString = input;
            } 
            //const lastAction = getVariables({ type: 'global' }).orora_selected_file;
            //console.log(lastAction);

            // 인자가 객체이면, 기존 배포.js의 handleWorldInfoUpdate로부터 온 호출로 간주합니다.
            else if (typeof input === 'object' && input !== null && input.orora_selected_file) {
                actionString = input.orora_selected_file;

                const globalVars_q = getVariables({ type: 'global' });
                if (globalVars_q && globalVars_q.orora_quick_run) {
                    //QR 임시대응

                    // 여기에 코드를 작성하면 안전합니다.
                    // orora_selected_file이 undefined, null, ""(빈 문자열)인 경우가 모두 걸러집니다.
                    //actionString = globalVars.orora_selected_file;
                    await triggerSlash('/flushglobalvar orora_quick_run');
                    this.triggerQuickAction();
                    return;
                }
            } 
            // 유효하지 않은 인자가 들어오면 작업을 중단합니다.
            else {

                

                    logger.warn('processAction에 유효하지 않은 인자가 전달되었습니다.', input);
                    return;
                
            }
            // --- 종료: 인자 타입 체크 ---

            await triggerSlash('/flushglobalvar orora_action_flag');
            
            // 이제부터 모든 로직은 actionString 변수를 기준으로 동일하게 동작합니다.
            const request = this.#parseRequest(actionString);
            if (!request) return;

            // 3. 재료 조달자: 필요한 모든 프롬프트 파일을 가져옵니다.
            const promptData = await this.#fetchPrompts(request);
            if (!promptData) return;

            // getVariables를 직접 호출하여 최신 globalVars를 가져옵니다.
            const globalVars = this.deps.getVariables({ type: 'global' });
            // 4. 셰프: 프롬프트를 조립하고, 랜덤/변수 등 모든 후처리를 수행합니다.
            const finalPrompt = await this.#assembleAndProcess(promptData, globalVars);
            
            // 5. 집행자: 최종 /gen 스크립트를 생성하고 실행합니다.
            await this.#executeGeneration(finalPrompt);

        } catch (error) {
            logger.error('DynamicMenu.processAction 실행 중 오류 발생:', error);
            toastr.error('선택 항목 처리 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
        }
    }
    
    async #loadDataAndParse() {
        const { getProxiedUrl, getPromptText, getVariables, logger } = this.deps;
        const yamlText = await getPromptText(getProxiedUrl('menu.yaml'));
        if (!yamlText) {
             toastr.error('menu.yaml 로딩 실패! 스크립트가 작동할 수 없습니다.');
             throw new Error('menu.yaml 로딩 실패');
        }
        // YAML 파일은 순수 텍스트를 바로 전처리합니다. (YAML.parse는 주석을 알아서 처리함)
        this.menuConfig = YAML.parse(this.deps.removeCommentLines(yamlText));
        const allGlobalVars = getVariables({ type: 'global' });
        const bookmarksJsonString = allGlobalVars.orora_char_bookmarks;
        if (bookmarksJsonString) {
            try {
                this.bookmarks = JSON.parse(bookmarksJsonString);
            } catch (e) {
                logger.error("북마크 JSON 파싱 실패:", e);
                this.bookmarks = [];
            }
        }
    }

    /**
     * [비공개] STscript 메뉴 UI 블록들을 조립합니다.
     * @returns {string} - 실행 가능한 메뉴 UI STscript 문자열
     */
    #buildMenuScriptBlocks() {
        // 상수를 편하게 사용하기 위한 별칭
        const C = this.constructor.CONSTANTS; 
        
        // STscript 블록들을 저장할 배열
        const definitionBlocks = [];
        
        // --- 원본 코드의 STscript 문자열을 포맷 변경 없이 그대로 가져옵니다 ---

        const triggerLogic = `/let triggerOroraJs {:
/let selectedFile {{pipe}} |
/setglobalvar key=orora_selected_file value={{var::selectedFile}} |
/setglobalvar key=orora_action_flag true |
/world state=on silent=true temp_orara
:}`;
        definitionBlocks.push(triggerLogic);

        // [수정] '↩️ 목록으로 돌아가기'만 상수로 안전하게 대체
        const auroralangSettingsMenu = `
        /let auroralangSettingsMenu {:
/getglobalvar key=orora_lang_setting |
/if left={{pipe}} right="" rule=eq {: /setglobalvar key=orora_lang_setting 한국어 :} |
/buttons labels=["한국어(기본값)", "English(영어)", "日本語(일본어)", "简体中文(중국어 간체)", "수동설정", "${C.LABELS.RETURN_TO_MAIN}"] 현재 설정된 언어 : {{getglobalvar::orora_lang_setting}} | 
/let choice {{pipe}} |
/if left={{var::choice}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_SELECTION} | /abort :} |
/if left={{var::choice}} right="한국어(기본값)" rule=eq {: /setglobalvar key=orora_lang_setting "한국어" | /echo 🌐 언어 설정이 '한국어'로 변경되었습니다. :} | 
/if left={{var::choice}} right="English(영어)" rule=eq {: /setglobalvar key=orora_lang_setting "English" | /echo 🌐 언어 설정이 '영어'로 변경되었습니다. :} | 
/if left={{var::choice}} right="日本語(일본어)" rule=eq {: /setglobalvar key=orora_lang_setting "日本語" | /echo 🌐 언어 설정이 '일본어'로 변경되었습니다. :} | 
/if left={{var::choice}} right="简体中文(중국어 간체)" rule=eq {: /setglobalvar key=orora_lang_setting "简体中文" | /echo 🌐 언어 설정이 '중국어 간체'로 변경되었습니다. :} | 
            /if left={{var::choice}} right="수동설정" rule=eq {: 
/input wide=off rows=1 설정할 언어를 입력해주세요.<br>(취소하려면 비워두세요) | /let customName {{pipe}} |
/if left={{var::customName}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_INPUT} | /abort :} |
/setglobalvar key=orora_lang_setting {{var::customName}} |
/echo 🌐 언어 설정이 '{{var::customName}}'(으)로 변경되었습니다.
:} | 
/if left={{var::choice}} right="${C.LABELS.RETURN_TO_MAIN}" rule=eq {: /:mainMenu :}
:}`;
        definitionBlocks.push(auroralangSettingsMenu);

        const executeDeleteScript = `/let executeDelete {:
/let charToDelete {{pipe}} |
/filter {{getglobalvar::orora_char_bookmarks}} {: /test left={{var::item}} rule=neq right={{var::charToDelete}} :} |
/setglobalvar key=orora_char_bookmarks |
/echo "🗑️ '{{var::charToDelete}}' 북마크를 삭제했습니다." | /abort
:}`;
        definitionBlocks.push(executeDeleteScript);

        // [수정] 상수 사용
        const deleteMenuLabels = [
            ...this.bookmarks.map(name => JSON.stringify(name)),
            JSON.stringify(C.LABELS.RETURN_TO_SETTINGS)
        ].join(', ');

        // [수정] 상수 사용
        const deleteMenuIfs = [
            ...this.bookmarks.map(name =>
                `/if left={{var::choice}} right=${JSON.stringify(name)} rule=eq {: /pass ${JSON.stringify(name)} | /:executeDelete :}`
            ),
            `/if left={{var::choice}} right="${C.LABELS.RETURN_TO_SETTINGS}" rule=eq {: /:auroraSettingsMenu :}`
        ].join(' | \n');

        // [수정] 상수 사용
        const deleteBookmarkMenuScript = `/let deleteBookmarkMenu {:
/if left={{getglobalvar::orora_char_bookmarks}} right=[] rule=neq else={: /echo ℹ️ 삭제할 북마크가 없습니다. || /:auroraSettingsMenu :} {:
    /buttons labels=[${deleteMenuLabels}] "삭제할 북마크를 선택하세요." |
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_DELETE} | /abort :} |
    ${deleteMenuIfs}
:}
:}`;
        definitionBlocks.push(deleteBookmarkMenuScript);

        const bookmarkLabels = this.bookmarks.map(name => JSON.stringify(`⭐ ${name}`));
        const bookmarkIfs = this.bookmarks.map(name => 
            `/if left={{var::choice}} right=${JSON.stringify(`⭐ ${name}`)} rule=eq {: /setglobalvar key=orora_fixed_char ${JSON.stringify(name)} | /echo 📌 캐릭터 설정이 ${name}(으)로 변경되었습니다. :}`
        );
        
        // [수정] 상수 사용
        const settingsMenuLabels = [
            '"🌱\\{\\{char\\}\\}(기본값)"',
            ...bookmarkLabels,
            JSON.stringify("➕ 북마크 추가"),
            JSON.stringify("🗑️ 북마크 삭제"), 
            JSON.stringify("수동설정"),
            JSON.stringify(C.LABELS.RETURN_TO_MAIN)
        ].join(', ');

        // [수정] 상수 사용
        const settingsMenuIfs = [
            `/if left={{var::choice}} right="🌱\\{\\{char\\}\\}(기본값)" rule=eq {: /setglobalvar key=orora_fixed_char "\\{\\{char\\}\\}" | /echo 🌱 캐릭터 설정이 기본값으로 변경되었습니다. :}`,
            ...bookmarkIfs,
            `
            /if left={{var::choice}} right="수동설정" rule=eq {: 
/input wide=off rows=1 고정할 캐릭터 이름을 입력해주세요.<br>(취소하려면 비워두세요) | /let customName {{pipe}} |
/if left={{var::customName}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_INPUT} | /abort :} |
/setglobalvar key=orora_fixed_char {{var::customName}} |
/echo 캐릭터 설정이 {{var::customName}}(으)로 변경되었습니다.
:}
`,
            `
            /if left={{var::choice}} right="➕ 북마크 추가" rule=eq {: /:addBookmark :} | 
            /if left={{var::choice}} right="🗑️ 북마크 삭제" rule=eq {: /:deleteBookmarkMenu :} | 
            /if left={{var::choice}} right="${C.LABELS.RETURN_TO_MAIN}" rule=eq {: /:mainMenu :}`
        ].join(' | \n');

        // [수정] 상수 사용
        const auroraSettingsScript = `
        /let addBookmark {:
/input "북마크에 추가할 캐릭터 이름을 입력하세요." |
/let newName {{pipe}} |
/if left={{var::newName}} right="" rule=eq {:
    /echo ${C.LABELS.CANCEL_INPUT} || /abort | 
:} else={:
/pass {{var::newName}} |
    /addglobalvar key=orora_char_bookmarks "{{var::newName}}" | 
    /echo "✅ '{{var::newName}}' 님이 캐릭터 북마크에 추가되었습니다." | /abort
:} |
:} |
        /let auroraSettingsMenu {:
/buttons labels=[${settingsMenuLabels}] 현재 설정된 캐릭터 : {{getglobalvar::orora_fixed_char}} | 
/let choice {{pipe}} |
/if left={{var::choice}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_SELECTION} | /abort :} |
${settingsMenuIfs}
:}
`;
        definitionBlocks.push(auroraSettingsScript);

        // [수정] 상수 사용
        const auroraCustomInputScript = `/let auroraCustomInput {:
/input wide=on rows=5 '사용자 정의 상황을 자유롭게 입력해주세요.<br>(취소하려면 비워두세요)' | /let customText {{pipe}} |
/if left={{var::customText}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_CUSTOM_INPUT} | /abort  :} |
/pass <request_custom_content> {{var::customText}} | /:triggerOroraJs
:}
`;
        definitionBlocks.push(auroraCustomInputScript);

        for (const category of this.menuConfig.categories) {
            // [수정] 상수 사용
            const subMenuLabels = [
                ...category.items.map(item => JSON.stringify(item.name)),
                JSON.stringify(C.LABELS.RETURN_TO_MAIN)
            ].join(', ');
            
            const subMenuIfs = category.items.map(item => 
                `/if left={{var::choice}} right=${JSON.stringify(item.name)} rule=eq {: /pass ${item.file} | /:triggerOroraJs :}`
            );
            // [수정] 상수 사용
            subMenuIfs.push(`/if left={{var::choice}} right="${C.LABELS.RETURN_TO_MAIN}" rule=eq {: /:mainMenu :}`);

            // [수정] 상수 사용
            const subMenuScript = `/let select${category.id} {:
/buttons labels=[${subMenuLabels}] "${category.prompt}" |
/let choice {{pipe}} |
/if left={{var::choice}} right="" rule=eq {: /echo ${C.LABELS.CANCEL_SUB_CONTENT_SELECTION} | /abort :} |
${subMenuIfs.join(' | \n    ')}
:}`;
            definitionBlocks.push(subMenuScript);
        }

        const randomMenu = this.menuConfig.static_menus.find(m => m.id === 'random');
        const settingsMenu = this.menuConfig.static_menus.find(m => m.id === 'settings');
        const customMenu = this.menuConfig.static_menus.find(m => m.id === 'custom');

        const mainMenuLabels = [
            JSON.stringify(randomMenu.name),
            ...this.menuConfig.categories.map(cat => JSON.stringify(cat.name)),
            JSON.stringify(settingsMenu.name),
            `"🌐 언어 설정"`,
            JSON.stringify(customMenu.name)
        ].join(', ');
        
        const mainIfClauses = [
            `/if left={{var::choice}} right=${JSON.stringify(randomMenu.name)} rule=eq {: /pass ${randomMenu.file} | /:triggerOroraJs :}`,
            ...this.menuConfig.categories.map(category => 
                `/if left={{var::choice}} right=${JSON.stringify(category.name)} rule=eq /:select${category.id}`
            ),
            `/if left={{var::choice}} right=${JSON.stringify(settingsMenu.name)} rule=eq /:auroraSettingsMenu`,
            `/if left={{var::choice}} right="🌐 언어 설정" rule=eq /:auroralangSettingsMenu`,
            `/if left={{var::choice}} right=${JSON.stringify(customMenu.name)} rule=eq /:auroraCustomInput`
        ];

        // 원본 포맷을 그대로 유지
        const mainMenuScript = `/let mainMenu {:
/getglobalvar key=orora_char_bookmarks |
/if left={{pipe}} right="" rule=eq {: /setglobalvar key=orora_char_bookmarks [] :} |
/getglobalvar key=orora_fixed_char |
/if left={{pipe}} right="" rule=eq {: /setglobalvar key=orora_fixed_char "\\{\\{char\\}\\}" | :} |
/getglobalvar orora_fixed_char | /pass {{pipe}} |

/if left={{pipe}} right="\\{\\{char\\}\\}" rule=eq else={:
    /buttons labels=[${mainMenuLabels}] "📌 【{{pipe}}】 📌 미니극장 장르를 선택해주세요." |
:} {:
    /buttons labels=[${mainMenuLabels}] 【${this.charName}】 미니극장 장르를 선택해주세요. |
:} |

/let choice {{pipe}} |
/if left={{var::choice}} right="" rule=eq {: /abort :} |
${mainIfClauses.join(' | \n    ')}
:}`;
        definitionBlocks.push(mainMenuScript);

        const stscriptCommand = definitionBlocks.join(' | \n') + ' | \n/:mainMenu';
        return stscriptCommand;
    }

    /**
     * [비공개] 사용자의 선택(`orora_selected_file`)을 해석하여 요청 객체로 만듭니다.
     * @param {string} selectedFile - 글로벌 변수의 값
     * @returns {object|null} - 해석된 요청 객체 { command, payload } 또는 null
     */
    #parseRequest(selectedFile) {
        const { logger } = this.deps;
        if (!selectedFile) {
            logger.warn('orora_selected_file 변수 값이 비어있어 작업을 중단합니다.');
            return null;
        }
        logger.debug(`오로라 트리거 감지됨: [${selectedFile}]`);
        const [command, ...payloadParts] = selectedFile.split(' ');
        const payload = payloadParts.join(' ');
        return { command, payload };
    }

    /**
     * [비공개] 해석된 요청에 따라 필요한 모든 프롬프트 파일을 가져옵니다.
     * @param {object} request - #parseRequest가 반환한 요청 객체
     * @returns {Promise<object|null>} - 프롬프트 데이터 객체 { top, middle, bottom } 또는 null
     */
    async #fetchPrompts(request) {
        const { getProxiedUrl, getPromptText } = this.deps;
        const isCustom = request.command.toLowerCase() === '<request_custom_content>';
        
        const urlsToFetch = [
            getProxiedUrl('prompts/top_prompt.txt'),
            getProxiedUrl('prompts/bottom_prompt.txt')
        ];
        if (!isCustom) {
            const moduleUrl = getProxiedUrl(`orora/${request.command}.txt`);
            urlsToFetch.push(moduleUrl);
        }
        
        const [topPrompt, bottomPrompt, modulePromptResult] = await Promise.all(
            urlsToFetch.map(url => getPromptText(url))
        );

        if (topPrompt === null || bottomPrompt === null) {
            toastr.error('필수 프롬프트(상단/하단) 로딩에 실패하여 중단합니다.');
            return null;
        }
        if (!isCustom && modulePromptResult === null) {
            toastr.error('모듈 프롬프트 로딩에 실패하여 중단합니다.');
            return null;
        }
        
        const middlePrompt = isCustom ? request.payload : modulePromptResult;
        return { topPrompt, middlePrompt, bottomPrompt };
    }

    /**
     * [재구성] 최종 설계도 기반의 '지휘자' 메서드.
     * @param {object} promptData - #fetchPrompts가 반환한 프롬프트 데이터 { topPrompt, middlePrompt, bottomPrompt }
     * @param {object} globalVars - 현재 글로벌 변수
     * @returns {Promise<string>} - 모든 처리가 완료된 최종 프롬프트 문자열
     */
    async #assembleAndProcess(promptData, globalVars) {
        const { logger } = this.deps;
        let { topPrompt, middlePrompt, bottomPrompt } = promptData;
        logger.debug("원본 프롬프트 수신:", { top: topPrompt.length, middle: middlePrompt.length, bottom: bottomPrompt.length });

        // --- 파이프라인 1: 프롬프트 전처리 ---
        const cleanTop = this.#preprocessPrompt(topPrompt, 'top');
        let cleanMiddle = this.#preprocessPrompt(middlePrompt, 'middle');
        const cleanBottom = this.#preprocessPrompt(bottomPrompt, 'bottom');
        logger.debug("전처리 완료:", { top: cleanTop.length, middle: cleanMiddle.length, bottom: cleanBottom.length });
        
        // --- 파이프라인 2: Middle 프롬프트 후처리 ---
        cleanMiddle = await this.#postprocessMiddlePrompt(cleanMiddle);
        logger.debug("Middle 후처리 완료:", { middle: cleanMiddle.length });

        const assembledPrompt = `${cleanTop}\n${cleanMiddle}\n${cleanBottom}`;
        logger.debug("전체 프롬프트 조립 완료:", { total: assembledPrompt.length });
        
        // --- 파이프라인 4: 전체 프롬프트 전처리 ---
        const finalPrompt = this.#postprocessFinalPrompt(assembledPrompt, globalVars);
        logger.debug("최종 후처리 완료:", { final: finalPrompt.length });

        return finalPrompt;
    }

    /**
     * [신규] 파이프라인 1단계: 프롬프트 전처리기.
     * 향후 Middle 프롬프트에만 적용해야 할 전처리 로직(예: 특정 태그 제거)을 위해 예약된 공간입니다.
     * @param {string} middlePrompt - 원본 Middle 프롬프트
     * @returns {string} - 전처리된 Middle 프롬프트
     */
    #preprocessPrompt(rawText, type) {
        let processedText = rawText;
        if (type === 'middle') {
            // TODO: 향후 필요시 이곳에 Middle 프롬프트 전용 전처리 로직을 추가합니다.
        }
        processedText = this.deps.removeCommentLines(processedText);
        return processedText;
    }

    /**
     * [역할 재정의] 파이프라인 2단계: Middle 프롬프트 후처리기.
     * 모듈 식별자(## INTERACTIVE_MODULE 등)를 실제 프롬프트로 교체하고, {{랜덤::}} 구문을 처리합니다.
     * @param {string} middlePrompt - 전처리된 Middle 프롬프트
     * @returns {Promise<string>} - 후처리된 Middle 프롬프트
     */
    async #postprocessMiddlePrompt(cleanMiddlePrompt) {
        const { logger, getProxiedUrl, getPromptText } = this.deps;
        logger.debug("파이프라인 2: Middle 프롬프트 후처리 시작...");

            // 1. '파일 로드' 전용 함수를 가장 먼저 호출하여 내용을 가져옵니다.
            //    await를 사용하여 파일 로드가 완료될 때까지 기다립니다.
            let processedPrompt = await this.#processFileLoading(cleanMiddlePrompt);
            //let processedPrompt = cleanMiddlePrompt;

        // 1. 처리할 모듈들을 '식별자: 파일명' 형태로 매핑합니다.
        const moduleTriggers = {
            '## INTERACTIVE_MODULE': 'prompts/modules/interactive_module_prompt.txt',
            '## REQUIRES_IMAGE_AVATARS': 'prompts/modules/image_avatar_specs_prompt.txt',
            '## COPY_BAN': 'prompts/modules/copy_ban.txt',
            '## ASSET_DRIVEN_UI': 'prompts/modules/asset_driven_ui_specs_prompt.txt'
        };

        // 2. 정의된 모든 모듈 식별자에 대해 반복 작업을 수행합니다.
        for (const [trigger, fileName] of Object.entries(moduleTriggers)) {
            if (processedPrompt.includes(trigger)) {
                logger.debug(`'${trigger}' 식별자 감지. '${fileName}' 모듈을 불러옵니다.`);
                const moduleRawText = await getPromptText(getProxiedUrl(fileName));
                if (moduleRawText) {
                    // 모듈 텍스트도 전처리를 거쳐야 합니다.
                    const moduleContent = this.#preprocessPrompt(moduleRawText, 'module');
                    processedPrompt = processedPrompt.replace(trigger, moduleContent);
                } else {
                    logger.warn(`'${fileName}' 모듈 로딩 실패.`);
                }
            }
        }

        // 3. 랜덤 처리 (내부화된 메서드 사용)
            logger.group('middle 랜덤 처리 전 (클릭하여 펼치기):', processedPrompt);
        processedPrompt = this.#processCustomRandom(processedPrompt);
            logger.group('middle 랜덤 처리 후 (클릭하여 펼치기):', processedPrompt);

        return processedPrompt;
    }

    /**
     * [역할 재정의] 파이프라인 4단계: 최종 후처리기.
     * 조립이 완료된 전체 프롬프트를 대상으로 {{char}} 및 언어 설정을 치환합니다.
     * @param {string} promptText - 조립 및 정규화가 끝난 프롬프트
     * @param {object} globalVars - 글로벌 변수 객체
     * @returns {string} - 모든 변수 치환이 완료된 최종 프롬프트
     */
    #postprocessFinalPrompt(assembledPrompt, globalVars) {
        const { logger } = this.deps;
        logger.debug("파이프라인 4: 최종 프롬프트 후처리 시작...");
        let finalPrompt = assembledPrompt;

        // 1. 변수 치환 (고정 캐릭터)
        const fixedChar = globalVars.orora_fixed_char;
        if (fixedChar && fixedChar !== '{{char}}') {
            logger.debug(`고정 캐릭터 [${fixedChar}](으)로 {{char}}를 치환합니다.`);
            finalPrompt = finalPrompt.replaceAll('{{char}}', fixedChar);
        }

        // 2. 변수 치환 (언어)
        const fixedlang = globalVars.orora_lang_setting;
        if (fixedlang) {
            logger.debug(`언어를 [${fixedlang}](으)로 치환합니다.`);
            finalPrompt = finalPrompt.replaceAll(/Korean/gi, fixedlang);
            finalPrompt = finalPrompt.replaceAll(/English/gi, fixedlang);
            finalPrompt = finalPrompt.replaceAll('한국어', fixedlang);
            finalPrompt = finalPrompt.replaceAll('한글', fixedlang);
            finalPrompt = finalPrompt.replaceAll('简体中文', fixedlang);
            finalPrompt = finalPrompt.replaceAll('中文', fixedlang);
        }

        return finalPrompt;
    }

    /**
     * [비공개] 최종 완성된 프롬프트를 기반으로 /gen STscript를 생성하고 실행합니다.
     * @param {string} finalPrompt - 최종 프롬프트 문자열
     */
    async #executeGeneration(finalPrompt) {
        const { logger, triggerSlash } = this.deps;
        logger.group("✅ 생성될 프롬프트 내용 (클릭하여 펼치기):", finalPrompt);
        // 최종 프롬프트 정규화는 여기서 한 번만 수행
        const normalizedPrompt = this.#normalizeText(finalPrompt);
        const finalScript = `
        /setglobalvar key=orora_correction_pending true |
        /let final_prompt \`${normalizedPrompt}\` | 

        /try {:

            /gen lock=on {{var::final_prompt}} | 

            /let generatedContent {{pipe}} |
            
            /if left={{var::generatedContent}} right="" rule=neq else={:
                /setglobalvar key=orora_correction_pending false |
                /echo title="생성 실패" severity=error "AI가 비어있는 응답을 반환했습니다. API 상태를 확인하거나 다시 시도해주세요." |
                /abort
            :} {:
                /sendas name={{char}} {{var::generatedContent}} | /hide {{lastMessageID}}
            :}
        :} | /catch {:
            /setglobalvar key=orora_correction_pending false |
            /echo title="생성 실패" severity=error "오로라소극장 스크립트 실행 중 오류가 발생했습니다. 다시 시도해주세요. 오류: {{exception}}"
        :}


        `            ;
        logger.group("실행될 최종 STscript (클릭하여 펼치기):", finalScript);
        await triggerSlash(finalScript);
    }

    /**
     * [비공개 헬퍼] 텍스트를 정규화합니다 (BOM 제거, 줄바꿈 통일, 양끝 공백 제거).
     * @param {string} text
     * @returns {string}
     */
    #normalizeText(text) {
        if (!text) return '';
        let cleanedText = text.replace(/^\uFEFF/, '');
        cleanedText = cleanedText.replace(/\r\n/g, '\n');
        cleanedText = cleanedText.trim();
        return cleanedText;
    }
    
    // --- [내부화] 랜덤 처리 관련 모든 헬퍼 함수들 ---
    #processCustomRandom(text) {
        if (!text || typeof text !== 'string') return '';
        let result = text;
        let maxIterations = 50;
        let iteration = 0;
        while (iteration < maxIterations) {
            const processed = this.#processSingleLevel(result);
            if (processed === result) break;
            result = processed;
            iteration++;
        }
        if (iteration >= maxIterations) this.deps.logger.warn('최대 반복 횟수 도달. 무한루프 방지를 위해 처리를 중단합니다.');
        return result;
    }
    #processSingleLevel(text) {
        let pos = 0;
        let deepestRandom = null;
        let maxDepth = -1;
        while (pos < text.length - 6) {
            const openPos = text.indexOf('{{', pos);
            if (openPos === -1) break;
            const randomInfo = this.#checkRandomPattern(text, openPos);
            if (randomInfo) {
                const closePos = this.#findMatchingClose(text, openPos);
                if (closePos !== -1) {
                    const depth = this.#calculateNestingDepth(text, openPos, closePos);
                    if (depth > maxDepth) {
                        maxDepth = depth;
                        deepestRandom = { start: openPos, end: closePos, patternLength: randomInfo.patternLength };
                    }
                }
            }
            pos = openPos + 2;
        }
        if (deepestRandom) {
            const content = text.substring(deepestRandom.start + deepestRandom.patternLength, deepestRandom.end - 2);
            const replacement = this.#selectRandomOption(content);
            return text.substring(0, deepestRandom.start) + replacement + text.substring(deepestRandom.end);
        }
        return text;
    }
    #checkRandomPattern(text, pos) {
        const patterns = ['{{랜덤::', '{{random::'];
        for (const pattern of patterns) {
            if (text.substr(pos, pattern.length).toLowerCase() === pattern.toLowerCase()) {
                return { patternLength: pattern.length };
            }
        }
        return null;
    }
    #findMatchingClose(text, startPos) {
        let braceCount = 1;
        let pos = startPos + 2;
        while (pos < text.length - 1 && braceCount > 0) {
            if (text.substr(pos, 2) === '{{') { braceCount++; pos += 2; } 
            else if (text.substr(pos, 2) === '}}') { braceCount--; pos += 2; } 
            else { pos++; }
        }
        return braceCount === 0 ? pos : -1;
    }
    #calculateNestingDepth(text, start, end) {
        const content = text.substring(start, end);
        let depth = 0;
        let pos = 0;
        while (pos < content.length - 6) {
            const randomPos = content.indexOf('{{랜덤::', pos);
            const randomPos2 = content.indexOf('{{random::', pos);
            let nextPos = -1;
            if (randomPos !== -1 && randomPos2 !== -1) { nextPos = Math.min(randomPos, randomPos2); } 
            else if (randomPos !== -1) { nextPos = randomPos; } 
            else if (randomPos2 !== -1) { nextPos = randomPos2; }
            if (nextPos === -1) break;
            depth++;
            pos = nextPos + 8;
        }
        return depth;
    }
    
        
        async #processFileLoading(promptText) {
            const { logger, getProxiedUrl, getPromptText } = this.deps;
            
            // ## LOAD_FILE::[파일경로] 형태의 구문을 찾기 위한 정규식입니다. (대소문자 무시)
            const fileLoadRegex = /##\s*LOAD_FILE::\s*(.*)/i;
            const match = promptText.match(fileLoadRegex);

            if (!match) {
                // 'LOAD_FILE' 구문이 없으면 원본 텍스트를 그대로 반환합니다.
                return promptText;
            }

            const fullMatchString = match[0]; // "## LOAD_FILE::my_story.txt" 전체 구문
            const filePath = match[1].trim(); // "my_story.txt" 부분
            logger.info(`'## LOAD_FILE' 구문을 감지했습니다. 파일 로드를 시도합니다: ${filePath}`);

            // orora/ 폴더를 기준으로 파일 경로를 조합하여 전체 URL을 만듭니다.
            // 예: 'test/new.txt' -> '.../proxy?file=orora/test/new.txt&...'
            const fileUrl = getProxiedUrl(`orora/${filePath}`);
            const fileContent = await getPromptText(fileUrl);

            if (fileContent !== null && fileContent !== undefined) {
                logger.info(`'${filePath}' 파일 로드 성공. 해당 구문을 파일 내용으로 치환합니다.`);
                // 원본 텍스트에서 '## LOAD_FILE::...' 부분만 파일 내용으로 교체하여 반환합니다.
                return promptText.replace(fullMatchString, fileContent);
            } else {
                logger.warn(`'${filePath}' 파일 로드 실패. 내용이 없거나 파일을 찾을 수 없습니다.`);
                // 실패 시, 해당 구문을 오류 메시지로 교체하여 반환합니다.
                //const errorMessage = `[오류: '${filePath}' 파일을 불러올 수 없습니다.]`;
                const errorMessage = '';
                return promptText.replace(fullMatchString, errorMessage);
            }
        }
    #selectRandomOption(content) {
        if (!content) return '';
        const options = this.#smartSplit(content, '::');
        if (options.length === 0) return '';
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex].trim();
    }
    #smartSplit(text, delimiter) {
        const result = [];
        let current = '';
        let braceCount = 0;
        let i = 0;
        while (i < text.length) {
            if (text.substr(i, 2) === '{{') { braceCount++; current += '{{'; i += 2; } 
            else if (text.substr(i, 2) === '}}') { braceCount--; current += '}}'; i += 2; } 
            else if (text.substr(i, delimiter.length) === delimiter && braceCount === 0) { result.push(current); current = ''; i += delimiter.length; } 
            else { current += text[i]; i++; }
        }
        if (current) result.push(current);
        return result;
    }
}    