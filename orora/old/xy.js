(function() {
    'use-strict';
    
    // 디버그 모드 플래그 (true: 상세 로그 출력+관리자용 설정창, false: 중요 로그만 출력)
    const DEBUG_MODE = true;
    const IS_TESTER_MODE = false; // ▼▼▼▼▼ [수정됨] 테스터 모드 플래그 신설 ▼▼▼▼▼

    // --- 설정 영역 ---
    
    // 프로젝트명 (현재는 디버그 로그에만 사용중)
    const PROJECT_NAME = '오로라소극장';
    // 버전 정보 (변경 시마다 업데이트 필요)
    const VERSION = '1.1.0-refactor';

    // 프로젝트 이름과 버전을 결합한 태그
    const LOG_TAG = `[${PROJECT_NAME} v${VERSION}]`;

    // --- 설정 영역2 ---

    // UI에 표시될 버튼의 이름을 지정합니다.
    const BUTTON_NAME = '오로라MENU';
    let isMenuLoading = false; // <<< 메뉴 로딩 상태를 추적할 플래그
    
    let charData = '';
    let charName = ''; // 전역 변수에 캐릭터 이름 할당

    // --- 설정 영역 끝 ---

    // 프롬프트 내용을 저장할 캐시 객체
    const promptCache = {};

    if (DEBUG_MODE) {
    toastr.info(LOG_TAG + ' 스크립트가 로드되었습니다.');
}
if (DEBUG_MODE && IS_TESTER_MODE) { // 테스터 모드일 때 알림 추가
    toastr.warning(LOG_TAG + ' 🧪 테스트 모드로 실행 중입니다.');
}


    // --- 헬퍼 함수 ---
    // 중앙화된 로깅 함수
    function createLogger() {

        return {
            // 디버그 모드일 때만 출력되는 일반 정보 로그
            debug: (message, ...args) => {
                if (DEBUG_MODE) {
                    console.log(`${LOG_TAG} ${message}`, ...args);
                }
            },
            
            // 항상 출력되는 중요 정보 로그
            info: (message, ...args) => {
                console.log(`${LOG_TAG} ${message}`, ...args);
            },
            
            // 항상 출력되는 경고 로그
            warn: (message, ...args) => {
                window.parent.log.warn(`${LOG_TAG} ${message}`, ...args);
            },
            
            // 항상 출력되는 에러 로그
            error: (message, ...args) => {
                window.parent.log.error(`${LOG_TAG} ${message}`, ...args);
            }
        };
    }

    const logger = createLogger();


    // 디버깅 로그: 스크립트가 로드될 때 F12 콘솔에 기록됩니다.
    logger.info(`스크립트 로드 완료.`);
    
    // --- 코드 원칙: 하나의 함수, 하나의 블록은 가급적 하나의 기능만 수행하도록 합니다 ---
    
    /**
     * 캐릭터 정보를 초기화하고 가져오는 함수
     * @returns {Promise<boolean>} 초기화 성공 여부
     */
    async function initializeCharacter() {
        logger.debug(`캐릭터 정보 초기화를 시작합니다.`);
        
        try {
            // 버튼 클릭시 캐릭터 정보 갱신
            charData = await getCharData();
            logger.debug(`현재 캐릭터 정보를 가져옵니다.`);
            
            if (!charData || !charData.name) {
                logger.error('캐릭터 정보를 가져오는 데 실패했습니다.');
                toastr.error('현재 캐릭터 정보를 가져올 수 없습니다.');
                return false; // 캐릭터 정보가 없으면 실패
            }
            
            charName = charData.name; // 전역 변수에 캐릭터 이름 할당
            logger.debug(`현재 캐릭터: ${charName}`);
            return true; // 초기화 성공
            
        } catch (error) {
            logger.error('캐릭터 초기화 중 오류 발생:', error);
            toastr.error('캐릭터 정보를 가져오는 중 오류가 발생했습니다.');
            return false;
        }
    }

    /**
     * @description 지정된 URL (특히 GitHub Raw 파일)에서 텍스트 콘텐츠를 비동기적으로 가져옵니다.
     *              항상 최신 데이터를 받기 위해 브라우저 캐시를 사용하지 않습니다.
     * @param {string} url - 가져올 파일의 전체 URL.
     * @returns {Promise<string>} 성공 시 파일의 텍스트 콘텐츠, 실패 시 에러 발생.
     */
    async function fetchTextFileFromUrl(url) {
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`서버 응답 오류 (상태: ${response.status})`);
            }
            return await response.text();
        } catch (error) {
            console.error(`URL에서 파일 로딩 실패 (${url}):`, error.message);
            throw error; 
        }
    }
        /**
     * @description 외부 YAML 설정을 기반으로 동적 STscript 메뉴를 생성하고 실행합니다.
     */
    async function createDynamicMenu() {
        
        //const menuConfigUrl = 'https://raw.githubusercontent.com/rosh00190/aurorapr/refs/heads/main/menu.yaml';
    
        try {
            // --- 1. YAML 설정 및 북마크 데이터 가져오기 ---
            //const yamlText = await fetchTextFileFromUrl(menuConfigUrl);
            // 캐싱 기능이 있는 getPromptText 함수로 교체
            //const yamlText = await getPromptText(menuConfigUrl);
            const yamlText = await getPromptText(getProxiedUrl('menu.yaml'));
            const menuConfig = YAML.parse(yamlText);
            
            const allGlobalVars = getVariables({ type: 'global' });
            const bookmarksJsonString = allGlobalVars.orora_char_bookmarks;
            let bookmarksArray = [];
            if (bookmarksJsonString) {
                try {
                    bookmarksArray = JSON.parse(bookmarksJsonString);
                } catch (e) {
                    logger.error("북마크 JSON 파싱 실패:", e);
                }
            }

            // --- 2. 모든 STscript 클로저 정의 ---
            const definitionBlocks = [];
    


            const triggerLogic = `/let triggerOroraJs {:
    /let selectedFile {{pipe}} |
    /setglobalvar key=orora_selected_file value={{var::selectedFile}} |
    /setglobalvar key=orora_action_flag true |
    /world state=on silent=true temp_orara
:}`;
            definitionBlocks.push(triggerLogic);




            const auroralangSettingsMenu = `
            
            
            /let auroralangSettingsMenu {:
			
			
    /getglobalvar key=orora_lang_setting |
    /if left={{pipe}} right="" rule=eq {: /setglobalvar key=orora_lang_setting 한국어 :} |
	
	
    /buttons labels=["한국어(기본값)", "English(영어)", "日本語(일본어)", "简体中文(중국어 간체)", "수동설정", "↩️ 목록으로 돌아가기"] 현재 설정된 언어 : {{getglobalvar::orora_lang_setting}} | 
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /echo ❌ 선택이 취소되었습니다. | /abort :} |
	
/if left={{var::choice}} right="한국어(기본값)" rule=eq {: /setglobalvar key=orora_lang_setting "한국어" | /echo 🌐 언어 설정이 '한국어'로 변경되었습니다. :} | 
/if left={{var::choice}} right="English(영어)" rule=eq {: /setglobalvar key=orora_lang_setting "English" | /echo 🌐 언어 설정이 '영어'로 변경되었습니다. :} | 
/if left={{var::choice}} right="日本語(일본어)" rule=eq {: /setglobalvar key=orora_lang_setting "日本語" | /echo 🌐 언어 설정이 '일본어'로 변경되었습니다. :} | 
/if left={{var::choice}} right="简体中文(중국어 간체)" rule=eq {: /setglobalvar key=orora_lang_setting "简体中文" | /echo 🌐 언어 설정이 '중국어 간체'로 변경되었습니다. :} | 

                /if left={{var::choice}} right="수동설정" rule=eq {: 
	/input wide=off rows=1 설정할 언어를 입력해주세요.<br>(취소하려면 비워두세요) | /let customName {{pipe}} |
    /if left={{var::customName}} right="" rule=eq {: /echo 입력이 취소되었습니다. | /abort :} |
    /setglobalvar key=orora_lang_setting {{var::customName}} |
    /echo 🌐 언어 설정이 '{{var::customName}}'(으)로 변경되었습니다.
    :} | 
    /if left={{var::choice}} right="↩️ 목록으로 돌아가기" rule=eq {: /:mainMenu :}
:}`;
                    definitionBlocks.push(auroralangSettingsMenu);

            

            // [신규] '북마크 삭제'를 실제로 실행하는 클로저
            const executeDeleteScript = `
            
            /let executeDelete {:
    /let charToDelete {{pipe}} |
    /filter {{getglobalvar::orora_char_bookmarks}} {: /test left={{var::item}} rule=neq right={{var::charToDelete}} :} |
    /setglobalvar key=orora_char_bookmarks |
    /echo "🗑️ '{{var::charToDelete}}' 북마크를 삭제했습니다." | /abort
:}`;
            definitionBlocks.push(executeDeleteScript);

            

            // [신규] '북마크 삭제' UI를 동적으로 생성하는 클로저
            const deleteMenuLabels = [
                ...bookmarksArray.map(name => JSON.stringify(name)),
                JSON.stringify("↩️ 이전 메뉴로 돌아가기") // 캐릭터 설정 메뉴로 돌아가는 버튼
            ].join(', ');

            const deleteMenuIfs = [
                ...bookmarksArray.map(name =>
                    `/if left={{var::choice}} right=${JSON.stringify(name)} rule=eq {: /pass ${JSON.stringify(name)} | /:executeDelete :}`
                ),
                `/if left={{var::choice}} right="↩️ 이전 메뉴로 돌아가기" rule=eq {: /:auroraSettingsMenu :}`
            ].join(' | \n');

            const deleteBookmarkMenuScript = `/let deleteBookmarkMenu {:
    /if left={{getglobalvar::orora_char_bookmarks}} right=[] rule=neq else={: /echo ℹ️ 삭제할 북마크가 없습니다. || /:auroraSettingsMenu :} {:
        /buttons labels=[${deleteMenuLabels}] "삭제할 북마크를 선택하세요." |
        /let choice {{pipe}} |
        /if left={{var::choice}} right="" rule=eq {: /echo ❌ 삭제가 취소되었습니다. | /abort :} |
        ${deleteMenuIfs}
    :}
:}`;
            definitionBlocks.push(deleteBookmarkMenuScript);




            // --- '캐릭터 설정' 메뉴 동적 생성 ---
            const bookmarkLabels = bookmarksArray.map(name => JSON.stringify(`⭐ ${name}`));
            const bookmarkIfs = bookmarksArray.map(name => 
                `/if left={{var::choice}} right=${JSON.stringify(`⭐ ${name}`)} rule=eq {: /setglobalvar key=orora_fixed_char ${JSON.stringify(name)} | /echo 📌 캐릭터 설정이 ${name}(으)로 변경되었습니다. :}`
            );
            

            const settingsMenuLabels = [
    '"🌱\\{\\{char\\}\\}(기본값)"', // JSON.stringify() 없이 직접 문자열로
                ...bookmarkLabels,
                JSON.stringify("➕ 북마크 추가"),
                JSON.stringify("🗑️ 북마크 삭제"), 
                JSON.stringify("수동설정"),
                JSON.stringify("↩️ 목록으로 돌아가기")
            ].join(', ');

            const settingsMenuIfs = [
    `/if left={{var::choice}} right="🌱\\{\\{char\\}\\}(기본값)" rule=eq {: /setglobalvar key=orora_fixed_char "\\{\\{char\\}\\}" | /echo 🌱 캐릭터 설정이 기본값으로 변경되었습니다. :}`,
                ...bookmarkIfs,
                `
                /if left={{var::choice}} right="수동설정" rule=eq {: 
	/input wide=off rows=1 고정할 캐릭터 이름을 입력해주세요.<br>(취소하려면 비워두세요) | /let customName {{pipe}} |
    /if left={{var::customName}} right="" rule=eq {: /echo 입력이 취소되었습니다. | /abort :} |
    /setglobalvar key=orora_fixed_char {{var::customName}} |
    /echo 캐릭터 설정이 {{var::customName}}(으)로 변경되었습니다.
    :}
    `,
                `
                
                /if left={{var::choice}} right="➕ 북마크 추가" rule=eq {: /:addBookmark :} | 
                /if left={{var::choice}} right="🗑️ 북마크 삭제" rule=eq {: /:deleteBookmarkMenu :} | 
                /if left={{var::choice}} right="↩️ 목록으로 돌아가기" rule=eq {: /:mainMenu :}`
            ].join(' | \n');

            const auroraSettingsScript = `
            
            /let addBookmark {:
    /input "북마크에 추가할 캐릭터 이름을 입력하세요." |
    /let newName {{pipe}} |
    /if left={{var::newName}} right="" rule=eq {:
        /echo ❌ 입력이 취소되었습니다. || /abort | 
    :} else={:
	/pass {{var::newName}} |
		/addglobalvar key=orora_char_bookmarks "{{var::newName}}" | 
        /echo "✅ '{{var::newName}}' 님이 캐릭터 북마크에 추가되었습니다." | /abort
    :} |
:} |
            
            /let auroraSettingsMenu {:
    /buttons labels=[${settingsMenuLabels}] 현재 설정된 캐릭터 : {{getglobalvar::orora_fixed_char}} | 
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /echo ❌ 선택이 취소되었습니다. | /abort :} |
    ${settingsMenuIfs}
:}
`;
            definitionBlocks.push(auroraSettingsScript);











            const auroraCustomInputScript = `/let auroraCustomInput {:
    /input wide=on rows=5 '사용자 정의 상황을 자유롭게 입력해주세요.<br>(취소하려면 비워두세요)' | /let customText {{pipe}} |
    /if left={{var::customText}} right="" rule=eq {: /echo ❌ 커스텀 상황 입력이 취소되었습니다. | /abort  :} |
    /pass <request_custom_content> {{var::customText}} | /:triggerOroraJs
:}
`;
            definitionBlocks.push(auroraCustomInputScript);

            for (const category of menuConfig.categories) {
                const subMenuLabels = [
                    ...category.items.map(item => JSON.stringify(item.name)),
                    JSON.stringify("↩️ 목록으로 돌아가기")
                ].join(', ');
                
                const subMenuIfs = category.items.map(item => 
                    `/if left={{var::choice}} right=${JSON.stringify(item.name)} rule=eq {: /pass ${item.file} | /:triggerOroraJs :}`
                );
                subMenuIfs.push(`/if left={{var::choice}} right="↩️ 목록으로 돌아가기" rule=eq {: /:mainMenu :}`);
    
                const subMenuScript = `/let select${category.id} {:
    /buttons labels=[${subMenuLabels}] "${category.prompt}" |
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /echo ❌ 세부 컨텐츠 선택이 취소되었습니다. | /abort :} |
    ${subMenuIfs.join(' | \n    ')}
:}`;
                definitionBlocks.push(subMenuScript);
            }
    
            // --- 3. 메인 메뉴 로직 조립 ---
            const randomMenu = menuConfig.static_menus.find(m => m.id === 'random');
            const settingsMenu = menuConfig.static_menus.find(m => m.id === 'settings');
            const customMenu = menuConfig.static_menus.find(m => m.id === 'custom');
    
            const mainMenuLabels = [
                JSON.stringify(randomMenu.name),
                ...menuConfig.categories.map(cat => JSON.stringify(cat.name)),
                JSON.stringify(settingsMenu.name),
                `"🌐 언어 설정"`,
                JSON.stringify(customMenu.name)
            ].join(', ');
            
            const mainIfClauses = [
                `/if left={{var::choice}} right=${JSON.stringify(randomMenu.name)} rule=eq {: /pass ${randomMenu.file} | /:triggerOroraJs :}`,
                ...menuConfig.categories.map(category => 
                    `/if left={{var::choice}} right=${JSON.stringify(category.name)} rule=eq /:select${category.id}`
                ),
                `/if left={{var::choice}} right=${JSON.stringify(settingsMenu.name)} rule=eq /:auroraSettingsMenu`,
                `/if left={{var::choice}} right="🌐 언어 설정" rule=eq /:auroralangSettingsMenu`,
                `/if left={{var::choice}} right=${JSON.stringify(customMenu.name)} rule=eq /:auroraCustomInput`
            ];
    
            const mainMenuScript = `/let mainMenu {:
    /getglobalvar key=orora_char_bookmarks |
    /if left={{pipe}} right="" rule=eq {: /setglobalvar key=orora_char_bookmarks [] :} |
    /getglobalvar key=orora_fixed_char |
	/if left={{pipe}} right="" rule=eq {: /setglobalvar key=orora_fixed_char "\\{\\{char\\}\\}" | :} |
/getglobalvar orora_fixed_char | /pass {{pipe}} |

    /if left={{pipe}} right="\\{\\{char\\}\\}" rule=eq else={:
		/buttons labels=[${mainMenuLabels}] "📌 【{{pipe}}】 📌 미니극장 장르를 선택해주세요." |
    :} {:
        /buttons labels=[${mainMenuLabels}] 【{{char}}】 미니극장 장르를 선택해주세요. |
    :} |
	
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /abort :} |
    ${mainIfClauses.join(' | \n    ')}
:}`;

///if left={{var::choice}} right="" rule=eq {: /echo ❌ 메뉴 선택이 취소되었습니다. | /abort :} |
            definitionBlocks.push(mainMenuScript);
    
            // --- 4. 최종 스크립트 실행 ---
            const stscriptCommand = definitionBlocks.join(' | \n') + ' | \n/:mainMenu';
            
            logger.debug("✅ 동적으로 생성된 최종 메뉴 스크립트:", stscriptCommand);
    
            await triggerSlash(stscriptCommand);
    
        } catch (error) {
            logger.error('createDynamicMenu 실행 중 오류 발생:', error);
            toastr.error('메뉴 스크립트 생성/실행 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
        }
    }

    // --- 프롬프트 조립 및 전송 로직 (handleWorldInfoUpdate) ---
    // (이하 기존 코드와 동일하므로 생략)
    // ...
    // PROMPT_URLS, getPromptText, debounceTimer, handleWorldInfoUpdate, eventOnButton, eventOn 등...
    // ...
/*
    // --- 설정: 모든 URL을 상단에서 관리하여 유지보수 용이성을 높입니다. ---
    const PROMPT_URLS = {
        base: 'https://rosh00190.github.io/aurorapr/',
        top: 'top_prompt.txt',
        bottom: 'bottom_prompt.txt',
        interactive: 'interactive_module_prompt.txt'
    };
    */
       // --- 설정: 모든 URL을 Vercel 프록시 서버를 통하도록 변경하여 원본 주소를 숨깁니다. ---
       const PROXY_SERVER_URL = 'https://aurorapr.vercel.app/api/proxy';

       /**
        * @description 프록시 서버를 통해 원하는 프롬프트 파일의 URL을 생성합니다.
        * @param {string} filePath - 저장소 내의 파일 경로 (예: 'top_prompt.txt' 또는 'orora/daily.txt')
        * @returns {string} - 프록시 서버에 요청할 전체 URL
        */
       function getProxiedUrl(filePath) {
           //return `${PROXY_SERVER_URL}?file=${filePath}`;
           // IS_TESTER_MODE 값에 따라 사용할 브랜치 이름을 결정합니다.
           // false면 'main', true면 'dev' 브랜치를 사용합니다.
           const branch = IS_TESTER_MODE ? 'dev' : 'main';
           // 쿼리 파라미터로 file과 branch 정보를 함께 넘깁니다.
           return `${PROXY_SERVER_URL}?file=${filePath}&branch=${branch}`;
       }

       

    /**
     * 텍스트에서 주석 라인(#으로 시작하는 라인)을 제거하는 함수
     * @param {string} text 원본 텍스트
     * @returns {string} 주석이 제거된 텍스트
     */
    function removeCommentLines(text) {
        if (!text) return ''; // 텍스트가 비어있으면 그대로 반환

        
        // 1단계: {{// ... }} 블록 주석 제거
        // /\{\{//.*?\}\}/gs 정규식 설명:
        // \{\{ 와 \}\} : 특수문자인 { }를 찾기 위해 이스케이프(\) 처리
        // .*?         : 모든 문자(.)가 0번 이상(*) 반복되는데, 최소한으로 매칭(?). -> 줄바꿈 포함 모든 내용을 선택
        // g (global)  : 텍스트 전체에서 일치하는 모든 블록을 찾음
        // s (dotAll)  : . 문자가 줄바꿈(\n) 문자도 포함하도록 함 (멀티라인을 위해 필수)
        //const blockCommentRegex = /\{\{//.*?\}\}/gs;
        

        // 1단계: {{// ... }} 블록 주석 제거 (new RegExp 생성자로 안전하게 생성)
        // 문자열 안에서는 특수문자인 백슬래시(\) 자체를 표현하기 위해 두 번(\\) 써야 합니다.
        const blockCommentRegex = new RegExp('\\{\\{//.*?\\}\\}', 'gs');
        let processedText = text.replace(blockCommentRegex, '');
        
        // 2단계: # 라인 주석 제거
        // 블록 주석이 제거된 텍스트를 대상으로 라인 주석을 처리합니다.
        processedText = processedText
            .split('\n')
            .filter(line => !line.trim().startsWith('//#'))
            .join('\n');

        return processedText;
    }

        
        /**
     * 완전히 새로 작성한 중첩 랜덤 처리 함수
     * 실제 괄호 매칭과 재귀적 처리를 통해 안정성을 극대화했습니다.
     */
    function processCustomRandom(text) {
        if (!text || typeof text !== 'string') return '';
        
        let result = text;
        let maxIterations = 50;
        let iteration = 0;
        
        // 무한루프 방지를 위한 처리
        while (iteration < maxIterations) {
            const processed = processSingleLevel(result);
            if (processed === result) {
                // 더 이상 변화가 없으면 종료
                break;
            }
            result = processed;
            iteration++;
        }
        
        if (iteration >= maxIterations) {
            console.warn('최대 반복 횟수 도달. 무한루프 방지를 위해 처리를 중단합니다.');
        }
        
        return result;
    }

    /**
     * 한 번에 하나의 가장 안쪽 랜덤 구문만 처리합니다.
     */
    function processSingleLevel(text) {
        // 모든 {{ 위치를 찾아서 랜덤 구문인지 확인
        let pos = 0;
        let deepestRandom = null;
        let maxDepth = -1;
        
        while (pos < text.length - 6) { // 최소 "{{랜덤::" 길이
            const openPos = text.indexOf('{{', pos);
            if (openPos === -1) break;
            
            // 랜덤 구문인지 확인
            const randomInfo = checkRandomPattern(text, openPos);
            if (randomInfo) {
                const closePos = findMatchingClose(text, openPos);
                if (closePos !== -1) {
                    const depth = calculateNestingDepth(text, openPos, closePos);
                    if (depth > maxDepth) {
                        maxDepth = depth;
                        deepestRandom = {
                            start: openPos,
                            end: closePos,
                            patternLength: randomInfo.patternLength
                        };
                    }
                }
            }
            
            pos = openPos + 2;
        }
        
        // 가장 깊은 중첩의 랜덤 구문을 처리
        if (deepestRandom) {
            const content = text.substring(
                deepestRandom.start + deepestRandom.patternLength, 
                deepestRandom.end - 2
            );
            const replacement = selectRandomOption(content);
            
            return text.substring(0, deepestRandom.start) + 
                replacement + 
                text.substring(deepestRandom.end);
        }
        
        return text; // 더 이상 처리할 랜덤 구문이 없음
    }

    /**
     * 랜덤 패턴인지 확인하고 패턴 정보를 반환합니다.
     */
    function checkRandomPattern(text, pos) {
        const patterns = [
            '{{랜덤::',
            '{{random::'
        ];
        
        for (const pattern of patterns) {
            if (text.substr(pos, pattern.length).toLowerCase() === pattern.toLowerCase()) {
                return { patternLength: pattern.length };
            }
        }
        return null;
    }

    /**
     * 정확한 괄호 매칭을 통해 닫는 }} 위치를 찾습니다.
     */
    function findMatchingClose(text, startPos) {
        let braceCount = 1; // 시작 {{
        let pos = startPos + 2;
        
        while (pos < text.length - 1 && braceCount > 0) {
            if (text.substr(pos, 2) === '{{') {
                braceCount++;
                pos += 2;
            } else if (text.substr(pos, 2) === '}}') {
                braceCount--;
                pos += 2;
            } else {
                pos++;
            }
        }
        
        return braceCount === 0 ? pos : -1;
    }

    /**
     * 중첩 깊이를 계산합니다. 더 깊은 중첩일수록 먼저 처리해야 합니다.
     */
    function calculateNestingDepth(text, start, end) {
        const content = text.substring(start, end);
        let depth = 0;
        let pos = 0;
        
        while (pos < content.length - 6) {
            const randomPos = content.indexOf('{{랜덤::', pos);
            const randomPos2 = content.indexOf('{{random::', pos);
            
            let nextPos = -1;
            if (randomPos !== -1 && randomPos2 !== -1) {
                nextPos = Math.min(randomPos, randomPos2);
            } else if (randomPos !== -1) {
                nextPos = randomPos;
            } else if (randomPos2 !== -1) {
                nextPos = randomPos2;
            }
            
            if (nextPos === -1) break;
            
            depth++;
            pos = nextPos + 8; // "{{랜덤::" 길이만큼 건너뛰기
        }
        
        return depth;
    }

    /**
     * 랜덤 선택을 수행합니다.
     */
    function selectRandomOption(content) {
        if (!content) return '';
        
        // :: 로 분할하되, 중첩된 {{}} 내부의 ::는 분할하지 않도록 주의
        const options = smartSplit(content, '::');
        
        if (options.length === 0) return '';
        
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex].trim();
    }

    /**
     * 중첩된 {{}} 구조를 고려하여 스마트하게 :: 로 분할합니다.
     */
    function smartSplit(text, delimiter) {
        const result = [];
        let current = '';
        let braceCount = 0;
        let i = 0;
        
        while (i < text.length) {
            if (text.substr(i, 2) === '{{') {
                braceCount++;
                current += text.substr(i, 2);
                i += 2;
            } else if (text.substr(i, 2) === '}}') {
                braceCount--;
                current += text.substr(i, 2);
                i += 2;
            } else if (text.substr(i, delimiter.length) === delimiter && braceCount === 0) {
                // 중첩되지 않은 상태에서만 분할
                result.push(current);
                current = '';
                i += delimiter.length;
            } else {
                current += text[i];
                i++;
            }
        }
        
        if (current) {
            result.push(current);
        }
        
        return result;
    }

    /**
     * @description URL의 텍스트 콘텐츠를 가져옵니다. 캐시를 활용합니다.
     * @param {string} url - 가져올 파일의 전체 URL.
     * @returns {Promise<string|null>} 성공 시 텍스트 콘텐츠, 실패 시 null.
     */
    async function getPromptText(url) {
        if (promptCache[url]) {
            logger.debug(`[Cache] '${url.split('/').pop()}' 파일은 캐시에서 불러옵니다.`);
            return promptCache[url];
        }
        try {
            logger.debug(`[Fetch] '${url.split('/').pop()}' 파일을 새로 불러옵니다.`);
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`서버 응답 오류 (상태: ${response.status}) for ${url}`);
            const textContent = await response.text();
            
            // 불러온 텍스트에서 주석을 제거합니다.
            const processedContent = removeCommentLines(textContent);
            
            // 주석이 제거된 버전을 캐시에 저장하고 반환합니다.
            promptCache[url] = processedContent;
            return processedContent;
            
        } catch (error) {
            logger.error(`URL에서 파일 로딩 실패:`, error);
            toastr.error(`${url.split('/').pop()} 파일 로딩에 실패했습니다.`);
            return null;
        }
    }
  
    // [신규] 디바운싱 타이머
    let debounceTimer;

    /**
     * @description World Info 변경을 감지하고, 글로벌 변수를 확인하여 AI 생성을 요청하는 새 핸들러.
     */
    async function handleWorldInfoUpdate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                const globalVars = getVariables({ type: 'global' });
                const actionFlag = globalVars.orora_action_flag;

                if (actionFlag !== 'true') {
                    return; // 우리가 발생시킨 이벤트가 아니므로 종료
                }

                // 즉시 플래그를 비활성화하여 중복 실행 및 무한 루프 방지
                await triggerSlash('/flushglobalvar orora_action_flag');

                const selectedFile = globalVars.orora_selected_file;
                if (!selectedFile) {
                    logger.warn('orora_selected_file 변수 값이 비어있어 작업을 중단합니다.');
                    return;
                }
                
                logger.debug(`오로라 트리거 감지됨: [${selectedFile}]`);

                // --- 기존 프롬프트 조립 로직 시작 (handleOroraTrigger에서 가져옴) ---
                const [command, ...payloadParts] = selectedFile.split(' ');
                const payload = payloadParts.join(' ');

                let middlePrompt = '';
                const isCustom = command.toLowerCase() === '<request_custom_content>';
/*
                const urlsToFetch = [
                    PROMPT_URLS.base + PROMPT_URLS.top,
                    PROMPT_URLS.base + PROMPT_URLS.bottom
                ];
*/


                // 프록시 서버를 통해 URL을 가져오도록 변경
                const urlsToFetch = [
                    getProxiedUrl('top_prompt.txt'),
                    getProxiedUrl('bottom_prompt.txt')
                ];

                if (isCustom) {
                    middlePrompt = payload;
                } else {
                    //const moduleUrl = `${PROMPT_URLS.base}/orora/${command}.txt`;
                    const moduleUrl = getProxiedUrl(`orora/${command}.txt`);
                    urlsToFetch.push(moduleUrl);
                }

                const [topPrompt, bottomPrompt, modulePromptResult] = await Promise.all(
                    urlsToFetch.map(url => getPromptText(url))
                );

                if (topPrompt === null || bottomPrompt === null) {
                    toastr.error('필수 프롬프트(상단/하단) 로딩에 실패하여 중단합니다.');
                    return;
                }
                if (!isCustom && modulePromptResult === null) {
                    toastr.error('모듈 프롬프트 로딩에 실패하여 중단합니다.');
                    return;
                }

                if (!isCustom) {
                    middlePrompt = modulePromptResult;
                }

                /*
                // 추가될 기술 명세 프롬프트를 담을 배열
                const techSpecPrompts = [];

                // 새로운 이미지 아바타 모듈 체크
                if (middlePrompt.includes('//# REQUIRES_IMAGE_AVATARS')) {
                    const avatarSpecsUrl = getProxiedUrl('image_avatar_specs_prompt.txt'); // 2단계에서 만든 파일
                    const avatarSpecsPrompt = await getPromptText(avatarSpecsUrl);
                    if (avatarSpecsPrompt) techSpecPrompts.push(avatarSpecsPrompt);
                }

                // 기존 인터랙티브 모듈 체크
                if (middlePrompt.includes('//# INTERACTIVE_MODULE')) {
                    const interactiveUrl = getProxiedUrl('interactive_module_prompt.txt');
                    const interactivePrompt = await getPromptText(interactiveUrl);
                    if (interactivePrompt) techSpecPrompts.push(interactivePrompt);
                }


                // 불러온 모든 기술 명세를 합침
                const techSpecsCombined = techSpecPrompts.join('\n\n');

                const modelPlain = `${topPrompt}\n${middlePrompt}\n${techSpecPrompts}\n${bottomPrompt}`;
                */
               // --- 이 아래 코드로 기존 로직을 교체하세요 ---

                // 1. 처리할 모듈들을 '식별자: 파일명' 형태로 매핑합니다. (확장성 용이)
                const moduleTriggers = {
                    '## INTERACTIVE_MODULE': 'interactive_module_prompt.txt',
                    '## REQUIRES_IMAGE_AVATARS': 'image_avatar_specs_prompt.txt'
                    // 나중에 새로운 모듈이 생기면 여기에 한 줄만 추가하면 됩니다.
                };

                
                // 2. middlePrompt를 복사하여, 이 변수를 계속 수정해 나갑니다.
                let processedMiddlePrompt = middlePrompt;


                // 3. 정의된 모든 모듈 식별자에 대해 반복 작업을 수행합니다.
                for (const [trigger, fileName] of Object.entries(moduleTriggers)) {
                    // 4. 현재 프롬프트에 식별자가 포함되어 있는지 확인합니다.
                    if (processedMiddlePrompt.includes(trigger)) {
                        logger.debug(`'${trigger}' 식별자 감지. '${fileName}' 모듈을 불러옵니다.`);
                        
                        // 5. 해당 기술 명세 파일을 비동기적으로 불러옵니다.
                        const moduleUrl = getProxiedUrl(fileName);
                        const moduleContent = await getPromptText(moduleUrl);
                        
                        // 6. 성공적으로 불러왔다면, 식별자를 파일 내용으로 '대체'합니다.
                        if (moduleContent) {
                            processedMiddlePrompt = processedMiddlePrompt.replace(trigger, moduleContent);
                        } else {
                            // 실패 시, AI에게 전달되지 않도록 식별자를 그냥 삭제합니다. (였는데 내가 캔슬함)
                            logger.warn(`'${fileName}' 모듈 로딩 실패.`);
                            //processedMiddlePrompt = processedMiddlePrompt.replace(trigger, '');
                        }
                    }
                }

                
                logger.debug('middle 랜덤 처리 전:', processedMiddlePrompt);
                // [신규] 스크립트 자체 랜덤 처리.
                processedMiddlePrompt = processCustomRandom(processedMiddlePrompt);
                logger.debug('middle 랜덤 처리 후:', processedMiddlePrompt);

                // 7. 모든 처리가 끝난 프롬프트를 사용하여 최종본을 조립합니다.
                const modelPlain = `${topPrompt}\n${processedMiddlePrompt}\n${bottomPrompt}`;

                // --- 여기까지 교체하면 됩니다 ---

                const normalizeText = (text) => {
    // 1. [수정] 문자열 시작 부분의 BOM(\uFEFF)을 명시적으로 제거합니다.
                    let cleanedText = text.replace(/^\uFEFF/, '');
    // 2. Windows 줄바꿈(\r\n)을 표준 줄바꿈(\n)으로 통일합니다.
                    cleanedText = cleanedText.replace(/\r\n/g, '\n');
                    cleanedText = cleanedText.trim();
                    return cleanedText;
                };

                let finalCleanPrompt = normalizeText(modelPlain);

                // [신규] '고정 캐릭터' 치환 로직
                const fixedChar = globalVars.orora_fixed_char;
                if (fixedChar && fixedChar !== '{{char}}') {
                    logger.debug(`고정 캐릭터 [${fixedChar}](으)로 {{char}}를 치환합니다.`);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('{{char}}', fixedChar);
                }
                // [신규] '고정 캐릭터' 치환 로직
                const fixedlang = globalVars.orora_lang_setting;
                if (fixedlang) {
                    logger.debug(`언어를 [${fixedlang}](으)로 치환합니다.`);
                    finalCleanPrompt = finalCleanPrompt.replaceAll(/Korean/gi, fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll(/English/gi, fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('한국어', fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('简体中文', fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('中文', fixedlang);
                    
                }

                logger.debug("✅ 최종 프롬프트 정규화 완료. AI 생성 요청...");
                logger.debug("생성될 프롬프트 내용:", finalCleanPrompt);

                const finalScript = `/let final_prompt \`${finalCleanPrompt}\` | /gen lock=on {{var::final_prompt}} | /sendas name={{char}} {{pipe}} | /hide {{lastMessageID}}`;
                
                logger.debug("실행될 최종 STscript:", finalScript); 
                await triggerSlash(finalScript);

            } catch (error) {
                logger.error('handleWorldInfoUpdate 함수 실행 중 오류 발생:', error);
                toastr.error('월드 인포 업데이트 처리 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
            }
        }, 150); // 디바운스 시간 (150ms)
    }

    // 메인 이벤트 핸들러
    eventOnButton(BUTTON_NAME, async () => {
        logger.debug(`"${BUTTON_NAME}" 버튼 클릭 감지됨.`);
        // 1. 이미 메뉴를 불러오는 중인지 확인
        if (isMenuLoading) {
            if (DEBUG_MODE) {
            toastr.info('⏳ 메뉴를 불러오는 중입니다. 잠시만 기다려주세요.');
            return;
            }
        }

        // 2. 로딩 시작: 플래그를 true로 설정하여 잠금
        isMenuLoading = true;


        

        try {
            const isInitialized = await initializeCharacter();
            if (!isInitialized) {
                // 초기화 실패 시 함수를 여기서 종료하므로 finally에서 플래그가 해제됨
                return;
            }
            
            const menuYamlUrl = getProxiedUrl('menu.yaml');
            if (!promptCache[menuYamlUrl]) {
                toastr.info('⏳ 오로라 메뉴 로딩중...');
            }
            
            // createDynamicMenu의 실행이 완전히 끝날 때까지 기다리도록 await 추가
            await createDynamicMenu();

        } catch (error) {
            // 예외 발생 시 로그 기록
            logger.error('메뉴 버튼 클릭 이벤트 처리 중 오류 발생:', error);
            toastr.error('메뉴를 표시하는 중 오류가 발생했습니다.');
        } finally {
            // 3. 로딩 종료: 성공하든, 실패하든 반드시 플래그를 false로 되돌려 잠금 해제
            isMenuLoading = false;
        }

    });

    // [교체] 이벤트 리스너를 월드 인포 업데이트로 변경
    eventOn(tavern_events.WORLDINFO_SETTINGS_UPDATED, handleWorldInfoUpdate);
    
})();