
    return class ResponseCorrector {
        /**
         * @param {object} deps - 스크립트 실행 동안 변하지 않는 고정 의존성 (헬퍼 함수 등)
         */
        constructor(deps) {
            this.deps = deps; // logger, getChatMessages, setChatMessages 등
            this.isCorrecting = false; // 중복 실행 방지를 위한 잠금 변수
        }

        /**
         * [리팩토링] CSS 교정 로직을 구현합니다.
         * @param {string} text - 교정할 텍스트
         * @returns {string} - CSS 교정이 적용된 텍스트
         */
        _correctCss(text) {
            this.deps.logger.debug('[CorrectorEngine] CSS 교정 단계를 시작합니다.');
            // 요청하신 정규식: height 속성값이 vh 단위인 경우 'height: auto'로 변경
            const correctedText = text.replace(/height:\s*\d+vh/g, 'height: auto');

            if (text !== correctedText) {
                this.deps.logger.debug('CSS 교정 적용: vh 단위의 height를 auto로 변경했습니다.');
            }

            return correctedText;
        }

        /**
         * [신규] HTML 교정 로직을 위한 플레이스홀더 함수입니다.
         * @param {string} text - 교정할 텍스트
         * @returns {string} - 현재는 원본 텍스트를 그대로 반환합니다.
         */
        _correctHtml(text) {
            this.deps.logger.debug('[CorrectorEngine] HTML 교정 단계를 시작합니다. (현재 구현 없음)');
            // TODO: 향후 이곳에 HTML 태그 교정 로직을 구현합니다.
            return text;
        }

        /**
         * [신규] JavaScript 교정 로직을 위한 플레이스홀더 함수입니다.
         * @param {string} text - 교정할 텍스트
         * @returns {string} - 현재는 원본 텍스트를 그대로 반환합니다.
         */
        _correctJs(text) {
            this.deps.logger.debug('[CorrectorEngine] JS 교정 단계를 시작합니다. (현재 구현 없음)');
            // TODO: 향후 이곳에 JavaScript 코드 교정 로직을 구현합니다.
            return text;
        }

        /**
         * [신규] 모든 교정 함수를 순차적으로 실행하는 교정 본체(엔진)입니다.
         * @param {string} originalText - 교정할 원본 메시지 텍스트
         * @returns {string} - 모든 교정이 완료된 최종 텍스트
         */
        _applyCorrections(originalText) {
            this.deps.logger.debug('[CorrectorEngine] 교정 파이프라인을 시작합니다...');
            let correctedText = originalText;

            // 파이프라인 1단계: CSS 교정
            correctedText = this._correctCss(correctedText);

            // 파이프라인 2단계: HTML 교정 (플레이스홀더)
            correctedText = this._correctHtml(correctedText);

            // 파이프라인 3단계: JavaScript 교정 (플레이스홀더)
            correctedText = this._correctJs(correctedText);

            this.deps.logger.debug('[CorrectorEngine] 교정 파이프라인이 완료되었습니다.');
            return correctedText;
        }

        /**
         * [리팩토링] 마지막 메시지를 가져와 교정 작업을 수행하는 메인 프로세서 (흐름 제어)
         * 이벤트 리스너에 의해 호출됩니다.
         * @param {string} message_id - 렌더링이 완료된 메시지의 ID
         */
        async processLastMessage(message_id) {
                // [수정] 1. 실행 잠금 확인: 이미 다른 작업이 실행 중이면 즉시 종료
            if (this.isCorrecting) {
                return;
            }

            const { logger, getChatMessages, setChatMessages, getVariables, triggerSlash } = this.deps;

                // 1. [확인] 교정 플래그가 활성화 상태인지 먼저 확인합니다.
            const globalVars = getVariables({ type: 'global' });
            if (globalVars.orora_correction_pending !== 'true') {
                return;
            }

                // [수정] 2. 잠금 설정 및 finally를 통한 잠금 해제 보장
            this.isCorrecting = true;
            try {
                logger.debug(`[ResponseCorrector] 교정 플래그 확인. 메시지 ID [${message_id}] 후처리 시작...`);

                    // 2. [추출] 방금 렌더링된 최신 메시지 객체를 가져옵니다.
                const latestMessage = getChatMessages(-1)[0];

                    // 3. [검증] 메시지가 없거나, ID가 일치하지 않으면 안전하게 종료합니다.
                if (!latestMessage || latestMessage.message_id !== message_id) {
                    logger.warn('[ResponseCorrector] 처리할 메시지를 찾지 못했거나 ID가 일치하지 않아 작업을 중단합니다.');
                    return;// finally는 return 시에도 실행되므로 잠금이 해제됩니다.
                }

                    // [수정] 3. 플래그 즉시 해제: setChatMessages를 호출하기 전에 플래그를 먼저 해제하여 무한 루프를 원천 차단합니다.
                    // 이 시점 이후로 발생하는 CHARACTER_MESSAGE_RENDERED 이벤트는 우리 시스템을 다시 트리거하지 않습니다.
                    //await triggerSlash('/setglobalvar key=orora_correction_pending false');
                await triggerSlash('/flushglobalvar orora_correction_pending');
                logger.debug(`[ResponseCorrector] 무한 루프 방지를 위해 교정 플래그를 즉시 해제합니다.`);

                const originalText = latestMessage.message;
                logger.debug('[ResponseCorrector] 원본 메시지 내용:', originalText);

                // [변경] 실제 교정 로직을 담당하는 _applyCorrections 함수를 호출합니다.
                const correctedText = this._applyCorrections(originalText);

                // [변경] 원본과 교정본이 다를 경우에만 메시지를 수정하고, 항상 숨김 처리합니다.
                const updatePayload = {
                    message_id: latestMessage.message_id,
                    //is_hidden: true,
                };

                    // 2. 내용이 변경되었을 경우에만 'message' 속성을 추가합니다.
                if (originalText !== correctedText) {
                    logger.debug(`[ResponseCorrector] 메시지 내용이 변경되어 교체하고 숨깁니다.`);
                    updatePayload.message = correctedText;
                } else {
                    logger.debug(`[ResponseCorrector] 내용 변경 없음. 메시지를 숨기기만 합니다.`);
                }

                    // 3. 최종적으로 구성된 페이로드로 setChatMessages를 한 번만 호출합니다.
                await setChatMessages([updatePayload]);

                logger.debug(`[ResponseCorrector] 메시지 ID [${message_id}] 후처리 완료.`);

            } catch (error) {
                logger.error('[ResponseCorrector] 메시지 처리 중 오류 발생:', error);
                // 오류 발생 시에도 플래그는 이미 해제되었고, 잠금은 finally에서 해제됩니다.
            } finally {
                    // [수정] 4. 잠금 해제: 작업이 성공하든, 실패하든, 중간에 return 되든 반드시 잠금을 해제합니다.
                this.isCorrecting = false;
                    // [문법 수정] /setglobalvar 명령어에서 부분을 제거합니다.
            }
        }
    }