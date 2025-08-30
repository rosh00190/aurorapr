return class ResponseCorrector {
    constructor(deps) {
        this.deps = deps;
        this.isCorrecting = false;
        
        this.activeCharName = null;
        this.cachedCharacterName = null;
        this.assetCache = null; 
    }

    _correctCss(text) {
        this.deps.logger.debug('[CorrectorEngine] CSS 교정 단계를 시작합니다.');
        const correctedText = text.replace(/height:\s*\d+vh/g, 'height: auto');
        if (text !== correctedText) {
            this.deps.logger.debug('CSS 교정 적용: vh 단위의 height를 auto로 변경했습니다.');
        }
        return correctedText;
    }

    _correctHtml(text) {
        this.deps.logger.debug('[CorrectorEngine] HTML 교정 단계를 시작합니다. (향후 확장을 위해 대기 중)');
        // TODO: 향후 이곳에 에셋 처리 외의 다른 HTML 태그 교정 로직을 구현합니다.
        return text;
    }

    _correctJs(text) {
        this.deps.logger.debug('[CorrectorEngine] JS 교정 단계를 시작합니다. (현재 구현 없음)');
        // TODO: 향후 이곳에 JavaScript 코드 교정 로직을 구현합니다.
        return text;
    }

    async _applyCorrections(originalText) {
        this.deps.logger.debug('[CorrectorEngine] 교정 파이프라인을 시작합니다...');
        let correctedText = originalText;

        correctedText = this._correctCss(correctedText);

        if (correctedText.includes('{{img::')) {
            this.deps.logger.debug('[CorrectorEngine] {{img::}} 태그가 감지되어 캐릭터 에셋 처리 파이프라인을 활성화합니다.');
            correctedText = await this._processCharacterAssets(correctedText);
        }

        correctedText = this._correctHtml(correctedText);
        correctedText = this._correctJs(correctedText);

        this.deps.logger.debug('[CorrectorEngine] 교정 파이프라인이 완료되었습니다.');
        return correctedText;
    }
    
    async _getAssetCache() {
        const { logger } = this.deps;
        try {
            const currentCharacterName = this.activeCharName;

            if (!currentCharacterName) {
                logger.warn("[CorrectorEngine] 현재 캐릭터 이름을 알 수 없어 에셋 캐싱을 건너뜁니다.");
                return null;
            }
    
            if (!this.assetCache || this.cachedCharacterName !== currentCharacterName) {
                logger.debug(`[CorrectorEngine] '${currentCharacterName}' 캐릭터의 에셋 목록을 새로 가져옵니다...`);
                
                const response = await fetch(`/api/sprites/get?name=${encodeURIComponent(currentCharacterName)}`);
                if (!response.ok) {
                    logger.error(`[CorrectorEngine] 에셋 API 요청 실패. Status: ${response.status}`);
                    this.assetCache = null;
                    return null;
                }
                const assets = await response.json();
                if (!Array.isArray(assets) || assets.length === 0) {
                    this.assetCache = new Set();
                } else {
                    const fileNames = assets.map(asset => asset.path.split('/').pop().split('?')[0]);
                    logger.group(`✅ [AssetList] '${currentCharacterName}' 캐릭터의 에셋 파일명 목록 (클릭하여 펼치기):`, fileNames);
                    this.assetCache = new Set(fileNames);
                    logger.debug(`[CorrectorEngine] 총 ${this.assetCache.size}개의 에셋을 캐시에 저장했습니다.`);
                }
                this.cachedCharacterName = currentCharacterName; 
            }
            return this.assetCache;
        } catch (error) {
            logger.error("[CorrectorEngine] 에셋 목록을 가져오는 중 예외 발생:", error);
            this.assetCache = null;
            return null;
        }
    }

    
        _processScriptContent(scriptContent, assetCache) {
            const { logger } = this.deps;
            let processedContent = scriptContent;

            const replaceInScript = (content, quote) => {
                const regex = new RegExp(`${quote}\\{\\{img::(.*?)\\}\\}${quote}`, 'gi');
                return content.replace(regex, (match, fileName) => {
                    if (assetCache && !assetCache.has(fileName.trim())) {
                        logger.warn(`스크립트 내 에셋 유효성 검사 실패: '${fileName.trim()}' 제거.`);
                        return `${quote}<!-- Invalid Asset: ${fileName.trim()} -->${quote}`;
                    }

                    const charNameForPath = this.activeCharName || 'unknown_character';
                    const imageUrl = `/characters/${charNameForPath}/${fileName.trim()}`;
                    const imgTag = `<img class="characterImage" src="${imageUrl}">`;

                    const escapedImgTag = imgTag.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");

                    logger.debug(`[CorrectorEngine] 스크립트 내 에셋 처리 결과: ${escapedImgTag}`);
                    return `${quote}${escapedImgTag}${quote}`;
                });
            };

            processedContent = replaceInScript(processedContent, "'");
            processedContent = replaceInScript(processedContent, '"');
            return processedContent;
        }

        _processHtmlContent(htmlContent, assetCache) {
            const { logger } = this.deps;
            let processedText = htmlContent;

            const imgSrcRegex = /(<img[^>]*\ssrc\s*=\s*["'])([^"']*\{\{img::(.*?)\}\}[^"']*)(["'][^>]*>)/gi;
            
            processedText = processedText.replace(imgSrcRegex, (match, pre, content, fileName, post) => {
                if (assetCache && !assetCache.has(fileName.trim())) {
                    logger.warn(`HTML img src 내 에셋 유효성 검사 실패: '${fileName.trim()}' 제거.`);
                    return `${pre}#${post}`;
                }
                
                const charNameForPath = this.activeCharName || 'unknown_character';
                const imageUrl = `/characters/${charNameForPath}/${fileName.trim()}`;
                const newContent = content.replace(/\{\{img::(.*?)\}\}/gi, imageUrl);
                
                logger.debug(`[CorrectorEngine] HTML img src 속성 내 처리 결과: ${pre}${newContent}${post}`);
                return `${pre}${newContent}${post}`;
            });

            const standaloneRegex = /\{\{img::(.*?)\}\}/gi;
            
            processedText = processedText.replace(standaloneRegex, (match, fileName) => {
                if (assetCache && !assetCache.has(fileName.trim())) {
                    logger.warn(`HTML 독립 에셋 유효성 검사 실패: '${fileName.trim()}' 제거.`);
                    return `<!-- Invalid Asset: ${fileName.trim()} -->`;
                }
                
                const charNameForPath = this.activeCharName || 'unknown_character';
                const imageUrl = `/characters/${charNameForPath}/${fileName.trim()}`;
                
                logger.debug(`[CorrectorEngine] HTML 독립 img 에셋 처리 결과: <img class="characterImage" src="${imageUrl}">`);
                return `<img class="characterImage" src="${imageUrl}">`;
            });

            return processedText;
        }

    async _processCharacterAssets(text) {
        const { logger } = this.deps;
        logger.debug('[CorrectorEngine] 캐릭터 에셋 처리 단계를 시작합니다 (매니저 역할).');

        const assetCache = await this._getAssetCache();

        const scriptBlockRegex = new RegExp('<' + 'script\\b[^>]*>([\\s\\S]*?)<\\/' + 'script>', 'gi');
        
        const processedScripts = [];
        const textWithPlaceholders = text.replace(
            scriptBlockRegex,
            (match, scriptContent) => {
                logger.debug('[CorrectorEngine] 스크립트 블록 감지. 스크립트 전문가에게 처리를 위임합니다.');
                const processedContent = this._processScriptContent(scriptContent, assetCache);
                processedScripts.push(processedContent);
                return `__SCRIPT_PLACEHOLDER_${processedScripts.length - 1}__`;
            }
        );

        const htmlProcessedText = this._processHtmlContent(textWithPlaceholders, assetCache);

        const placeholderRegex = new RegExp('__SCRIPT_PLACEHOLDER_(\\d+)__', 'gi');

        const finalResult = htmlProcessedText.replace(
            placeholderRegex,
            (match, index) => {
                return '<' + `script>${processedScripts[parseInt(index, 10)]}<` + '/script>';
            }
        );

        return finalResult;
    }

    
    _playSoundEffect() {
        const { logger } = this.deps;
        try {

            const context = parent.SillyTavern.getContext();
            const playSoundSetting = context.powerUserSettings.play_message_sound;
            const playUnfocusedSetting = context.powerUserSettings.play_sound_unfocused;
            const hasFocus = parent.document.hasFocus();

            if (!playSoundSetting) {
                return;
            }
            if (playUnfocusedSetting && hasFocus) {
                logger.debug("사운드 재생 결과: '배경 소리만'이 켜져 있고 탭이 활성화 상태라 종료합니다.");
                return;
            }

            logger.debug("사운드 재생 결과: 모든 조건을 통과하여 소리를 재생합니다!");
            audioSelect({type: 'ambient'}, '/sounds/message.mp3');

        } catch (error) {
            logger.error('[ResponseCorrector] 사운드 재생 중 오류 발생:', error);
        }
    }

    async processLastMessage(message_id, activeCharName) {
        this.activeCharName = activeCharName;
        if (this.isCorrecting) {
            return;
        }

        const { logger, getChatMessages, setChatMessages, getVariables, triggerSlash } = this.deps;
        
        const globalVars = getVariables({ type: 'global' });
        if (globalVars.orora_correction_pending !== 'true') {
            return;
        }

        this.isCorrecting = true;
        try {
            logger.debug(`[ResponseCorrector] 교정 플래그 확인. 메시지 ID [${message_id}] 후처리 시작...`);
            
            const latestMessage = getChatMessages(-1)[0];
            if (!latestMessage || latestMessage.message_id !== message_id) {
                logger.warn('[ResponseCorrector] 처리할 메시지를 찾지 못했거나 ID가 일치하지 않아 작업을 중단합니다.');
                return;
            }

            await triggerSlash('/flushglobalvar orora_correction_pending');
            logger.debug(`[ResponseCorrector] 무한 루프 방지를 위해 교정 플래그를 즉시 해제합니다.`);
            const originalText = latestMessage.message;
            logger.group('[ResponseCorrector] 원본 메시지 내용 (클릭하여 펼치기):', originalText);

            const correctedText = await this._applyCorrections(originalText);

            if (originalText !== correctedText) {
                logger.debug(`[ResponseCorrector] 메시지 내용이 변경되어 교체합니다.`);
                const updatePayload = {
                    message_id: latestMessage.message_id,
                    message: correctedText,
                };
                await setChatMessages([updatePayload]);
            } else {
                logger.debug(`[ResponseCorrector] 내용 변경 없음.`);
            }
            //v1.1.0 - 실리 사양 메세지 사운드 재생
            this._playSoundEffect();

            logger.debug(`[ResponseCorrector] 메시지 ID [${message_id}] 후처리 완료.`);
        } catch (error) {
            logger.error('[ResponseCorrector] 메시지 처리 중 오류 발생:', error);
        } finally {
            this.isCorrecting = false;
        }
    }
}