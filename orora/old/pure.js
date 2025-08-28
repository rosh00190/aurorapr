//v1.8.0-pure

(function() {
    'use-strict';

    const DEBUG_MODE = false;
    const IS_TESTER_MODE = false;

    const PROJECT_NAME = '오로라소극장';
    const VERSION = '1.0.0-release';
    const LOG_TAG = `[${PROJECT_NAME} v${VERSION}]`;
    const BUTTON_NAME = '오로라MENU';
    let isMenuLoading = false;

    let charData = '';
    let charName = '';
    const promptCache = {};

    if (DEBUG_MODE) {
        toastr.info(LOG_TAG + ' 스크립트가 로드되었습니다.');
    }
    if (DEBUG_MODE && IS_TESTER_MODE) { // 테스터 모드일 때 알림 추가
        toastr.warning(LOG_TAG + ' 🧪 테스트 모드로 실행 중입니다.');
    }

    function createLogger() {
        return {
            debug: (message, ...args) => {
                if (DEBUG_MODE) {
                    console.log(`${LOG_TAG} ${message}`, ...args);
                }
            },
            info: (message, ...args) => {
                console.log(`${LOG_TAG} ${message}`, ...args);
            },
            warn: (message, ...args) => {
                window.parent.log.warn(`${LOG_TAG} ${message}`, ...args);
            },
            error: (message, ...args) => {
                window.parent.log.error(`${LOG_TAG} ${message}`, ...args);
            }
        };
    }

    const logger = createLogger();
    logger.info(`스크립트 로드 완료.`);

    async function initializeCharacter() {
        try {
            charData = await getCharData();
            if (!charData || !charData.name) {
                logger.error('캐릭터 정보를 가져오는 데 실패했습니다.');
                toastr.error('현재 캐릭터 정보를 가져올 수 없습니다.');
                return false;
            }
            charName = charData.name;
            return true;
        } catch (error) {
            logger.error('캐릭터 초기화 중 오류 발생:', error);
            toastr.error('캐릭터 정보를 가져오는 중 오류가 발생했습니다.');
            return false;
        }
    }

    async function createDynamicMenu() {
        try {
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

                    
            const CONSTANTS = {
                LABELS: {
                    RETURN_TO_MAIN: '↩️ 목록으로 돌아가기',
                }
            };
            
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
	
	
    /buttons labels=["한국어(기본값)", "English(영어)", "日本語(일본어)", "简体中文(중국어 간체)", "수동설정", "${CONSTANTS.LABELS.RETURN_TO_MAIN}"] 현재 설정된 언어 : {{getglobalvar::orora_lang_setting}} | 
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
    /if left={{var::choice}} right="${CONSTANTS.LABELS.RETURN_TO_MAIN}" rule=eq {: /:mainMenu :}
:}`;
                    definitionBlocks.push(auroralangSettingsMenu);
            const executeDeleteScript = `/let executeDelete {:
    /let charToDelete {{pipe}} |
    /filter {{getglobalvar::orora_char_bookmarks}} {: /test left={{var::item}} rule=neq right={{var::charToDelete}} :} |
    /setglobalvar key=orora_char_bookmarks |
    /echo "🗑️ '{{var::charToDelete}}' 북마크를 삭제했습니다." | /abort
:}`;
            definitionBlocks.push(executeDeleteScript);

            const deleteMenuLabels = [...bookmarksArray.map(name => JSON.stringify(name)), JSON.stringify("↩️ 이전 메뉴로 돌아가기")].join(', ');
            const deleteMenuIfs = [...bookmarksArray.map(name => `/if left={{var::choice}} right=${JSON.stringify(name)} rule=eq {: /pass ${JSON.stringify(name)} | /:executeDelete :}`), `/if left={{var::choice}} right="↩️ 이전 메뉴로 돌아가기" rule=eq {: /:auroraSettingsMenu :}`].join(' | \n');
            const deleteBookmarkMenuScript = `/let deleteBookmarkMenu {:
    /if left={{getglobalvar::orora_char_bookmarks}} right=[] rule=neq else={: /echo ℹ️ 삭제할 북마크가 없습니다. || /:auroraSettingsMenu :} {:
        /buttons labels=[${deleteMenuLabels}] "삭제할 북마크를 선택하세요." |
        /let choice {{pipe}} |
        /if left={{var::choice}} right="" rule=eq {: /echo ❌ 삭제가 취소되었습니다. | /abort :} |
        ${deleteMenuIfs}
    :}
:}`;
            definitionBlocks.push(deleteBookmarkMenuScript);

            const bookmarkLabels = bookmarksArray.map(name => JSON.stringify(`⭐ ${name}`));
            const bookmarkIfs = bookmarksArray.map(name => `/if left={{var::choice}} right=${JSON.stringify(`⭐ ${name}`)} rule=eq {: /setglobalvar key=orora_fixed_char ${JSON.stringify(name)} | /echo 📌 캐릭터 설정이 ${name}(으)로 변경되었습니다. :}`);
            const settingsMenuLabels = ['"🌱\\{\\{char\\}\\}(기본값)"', ...bookmarkLabels, JSON.stringify("➕ 북마크 추가"), JSON.stringify("🗑️ 북마크 삭제"), JSON.stringify("수동설정"), JSON.stringify(CONSTANTS.LABELS.RETURN_TO_MAIN)].join(', ');
            const settingsMenuIfs = [`/if left={{var::choice}} right="🌱\\{\\{char\\}\\}(기본값)" rule=eq {: /setglobalvar key=orora_fixed_char "\\{\\{char\\}\\}" | /echo 🌱 캐릭터 설정이 기본값으로 변경되었습니다. :}`, ...bookmarkIfs, `/if left={{var::choice}} right="수동설정" rule=eq {: 
	/input wide=off rows=1 고정할 캐릭터 이름을 입력해주세요.<br>(취소하려면 비워두세요) | /let customName {{pipe}} |
    /if left={{var::customName}} right="" rule=eq {: /echo 입력이 취소되었습니다. | /abort :} |
    /setglobalvar key=orora_fixed_char {{var::customName}} |
    /echo 캐릭터 설정이 {{var::customName}}(으)로 변경되었습니다.
    :}
    `, `/if left={{var::choice}} right="➕ 북마크 추가" rule=eq {: /:addBookmark :} | 
                /if left={{var::choice}} right="🗑️ 북마크 삭제" rule=eq {: /:deleteBookmarkMenu :} | 
                /if left={{var::choice}} right="${CONSTANTS.LABELS.RETURN_TO_MAIN}" rule=eq {: /:mainMenu :}`].join(' | \n');
            const auroraSettingsScript = `/let addBookmark {:
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
:}`;
            definitionBlocks.push(auroraSettingsScript);

            const auroraCustomInputScript = `/let auroraCustomInput {:
    /input wide=on rows=5 '사용자 정의 상황을 자유롭게 입력해주세요.<br>(취소하려면 비워두세요)' | /let customText {{pipe}} |
    /if left={{var::customText}} right="" rule=eq {: /echo ❌ 커스텀 상황 입력이 취소되었습니다. | /abort  :} |
    /pass <request_custom_content> {{var::customText}} | /:triggerOroraJs
:}`;
            definitionBlocks.push(auroraCustomInputScript);

            for (const category of menuConfig.categories) {
                const subMenuLabels = [...category.items.map(item => JSON.stringify(item.name)), JSON.stringify(CONSTANTS.LABELS.RETURN_TO_MAIN)].join(', ');
                const subMenuIfs = category.items.map(item => `/if left={{var::choice}} right=${JSON.stringify(item.name)} rule=eq {: /pass ${item.file} | /:triggerOroraJs :}`);
                subMenuIfs.push(`/if left={{var::choice}} right=${JSON.stringify(CONSTANTS.LABELS.RETURN_TO_MAIN)} rule=eq {: /:mainMenu :}`);
                const subMenuScript = `/let select${category.id} {:
    /buttons labels=[${subMenuLabels}] "${category.prompt}" |
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /echo ❌ 세부 컨텐츠 선택이 취소되었습니다. | /abort :} |
    ${subMenuIfs.join(' | \n    ')}
:}`;
                definitionBlocks.push(subMenuScript);
            }

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
		/buttons labels=[${mainMenuLabels}] "📌 【{{pipe}}】📌 미니극장 장르를 선택해주세요." |
    :} {:
        /buttons labels=[${mainMenuLabels}] 【{{char}}】 미니극장 장르를 선택해주세요. |
    :} |
	
    /let choice {{pipe}} |
    /if left={{var::choice}} right="" rule=eq {: /abort :} |
    ${mainIfClauses.join(' | \n    ')}
:}`;
            definitionBlocks.push(mainMenuScript);

            const stscriptCommand = definitionBlocks.join(' | \n') + ' | \n/:mainMenu';
            await triggerSlash(stscriptCommand);

        } catch (error) {
            logger.error('메뉴 생성/실행 중 오류 발생:', error);
            toastr.error('메뉴 스크립트 생성/실행 중 오류가 발생했습니다.');
        }
    }

    const PROXY_SERVER_URL = 'https://aurorapr.vercel.app/api/proxy';

    function getProxiedUrl(filePath) {
        const branch = IS_TESTER_MODE ? 'dev' : 'main';
        return `${PROXY_SERVER_URL}?file=${filePath}&branch=${branch}`;
    }
    
    function removeCommentLines(text) {
        if (!text) return ''; 

        const blockCommentRegex = new RegExp('\\{\\{//.*?\\}\\}', 'gs');
        let processedText = text.replace(blockCommentRegex, '');

        processedText = processedText
            .split('\n')
            .filter(line => !line.trim().startsWith('//#'))
            .join('\n');

        return processedText;
    }


    function processCustomRandom(text) {
        if (!text || typeof text !== 'string') return '';
        
        let result = text;
        let maxIterations = 50;
        let iteration = 0;
        
        // 무한루프 방지를 위한 처리
        while (iteration < maxIterations) {
            const processed = processSingleLevel(result);
            if (processed === result) {
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

    function processSingleLevel(text) {
        let pos = 0;
        let deepestRandom = null;
        let maxDepth = -1;
        
        while (pos < text.length - 6) {
            const openPos = text.indexOf('{{', pos);
            if (openPos === -1) break;
            
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
        
        return text;
    }

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
            pos = nextPos + 8;
        }
        
        return depth;
    }

    function selectRandomOption(content) {
        if (!content) return '';
        
        const options = smartSplit(content, '::');
        
        if (options.length === 0) return '';
        
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex].trim();
    }

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

    

    async function getPromptText(url) {
        if (promptCache[url]) {
            return promptCache[url];
        }
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`서버 응답 오류 (상태: ${response.status}) for ${url}`);
            const textContent = await response.text();
            const processedContent = removeCommentLines(textContent);
            promptCache[url] = processedContent;
            return processedContent;
        } catch (error) {
            logger.error(`URL에서 파일 로딩 실패:`, error);
            toastr.error(`${url.split('/').pop()} 파일 로딩에 실패했습니다.`);
            return null;
        }
    }

    let debounceTimer;

    async function handleWorldInfoUpdate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                const globalVars = getVariables({ type: 'global' });
                const actionFlag = globalVars.orora_action_flag;

                if (actionFlag !== 'true') {
                    return;
                }

                await triggerSlash('/flushglobalvar orora_action_flag');
                const selectedFile = globalVars.orora_selected_file;
                if (!selectedFile) {
                    logger.warn('orora_selected_file 변수 값이 비어있어 작업을 중단합니다.');
                    return;
                }
                logger.debug(`오로라 트리거 감지됨: [${selectedFile}]`);

                const [command, ...payloadParts] = selectedFile.split(' ');
                const payload = payloadParts.join(' ');
                let middlePrompt = '';
                const isCustom = command.toLowerCase() === '<request_custom_content>';

                const urlsToFetch = [
                    getProxiedUrl('top_prompt.txt'),
                    getProxiedUrl('bottom_prompt.txt')
                ];

                if (isCustom) {
                    middlePrompt = payload;
                } else {
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
                
                const moduleTriggers = {
                    '## INTERACTIVE_MODULE': 'interactive_module_prompt.txt',
                    '## REQUIRES_IMAGE_AVATARS': 'image_avatar_specs_prompt.txt'
                };

                let processedMiddlePrompt = middlePrompt;

                
                for (const [trigger, fileName] of Object.entries(moduleTriggers)) {
                    if (processedMiddlePrompt.includes(trigger)) {
                        logger.debug(`'${trigger}' 식별자 감지. '${fileName}' 모듈을 불러옵니다.`);
                        
                        const moduleUrl = getProxiedUrl(fileName);
                        const moduleContent = await getPromptText(moduleUrl);
                        if (moduleContent) {
                            processedMiddlePrompt = processedMiddlePrompt.replace(trigger, moduleContent);
                        } else {
                            logger.warn(`'${fileName}' 모듈 로딩 실패.`);
                            //processedMiddlePrompt = processedMiddlePrompt.replace(trigger, '');
                        }
                    }
                }

                

                
                logger.debug('middle 랜덤 처리 전:', processedMiddlePrompt);
                // 모든 텍스트가 합쳐진 후에 랜덤 처리를 최종적으로 한 번만 실행
                processedMiddlePrompt = processCustomRandom(processedMiddlePrompt);
                logger.debug('middle 랜덤 처리 후:', processedMiddlePrompt);
                
                const modelPlain = `${topPrompt}\n${processedMiddlePrompt}\n${bottomPrompt}`;

                const normalizeText = (text) => {
                    let cleanedText = text.replace(/^\uFEFF/, '');
                    cleanedText = cleanedText.replace(/\r\n/g, '\n');
                    cleanedText = cleanedText.trim();
                    return cleanedText;
                };

                let finalCleanPrompt = normalizeText(modelPlain);
                const fixedChar = globalVars.orora_fixed_char;
                if (fixedChar && fixedChar !== '{{char}}') {
                    logger.debug(`고정 캐릭터 [${fixedChar}](으)로 {{char}}를 치환합니다.`);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('{{char}}', fixedChar);
                }

                const fixedlang = globalVars.orora_lang_setting;
                if (fixedlang) {
                    logger.debug(`언어를 [${fixedlang}](으)로 치환합니다.`);
                    finalCleanPrompt = finalCleanPrompt.replaceAll(/Korean/gi, fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll(/English/gi, fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('한국어', fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('简体中文', fixedlang);
                    finalCleanPrompt = finalCleanPrompt.replaceAll('中文', fixedlang);
                    
                }

                logger.debug("최종 프롬프트 정규화 완료. AI 생성 요청...");

                const finalScript = `/let final_prompt \`${finalCleanPrompt}\` | /gen lock=on {{var::final_prompt}} | /sendas name={{char}} {{pipe}} | /hide {{lastMessageID}}`;
                await triggerSlash(finalScript);

            } catch (error) {
                logger.error('월드 인포 업데이트 처리 중 오류 발생:', error);
                toastr.error('월드 인포 업데이트 처리 중 오류가 발생했습니다.');
            }
        }, 150);
    }

    eventOnButton(BUTTON_NAME, async () => {
        if (isMenuLoading) {
            return;
        }

        isMenuLoading = true;

        try {
            const isInitialized = await initializeCharacter();
            if (!isInitialized) {
                return;
            }
            
            const menuYamlUrl = getProxiedUrl('menu.yaml');
            if (!promptCache[menuYamlUrl]) {
                toastr.info('⏳ 오로라 메뉴 로딩중...');
            }
            
            await createDynamicMenu();

        } catch (error) {
            logger.error('메뉴 버튼 클릭 이벤트 처리 중 오류 발생:', error);
            toastr.error('메뉴를 표시하는 중 오류가 발생했습니다.');
        } finally {
            isMenuLoading = false;
        }
    });

    eventOn(tavern_events.WORLDINFO_SETTINGS_UPDATED, handleWorldInfoUpdate);
    
})();