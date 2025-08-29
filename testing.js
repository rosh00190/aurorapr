// orora.1.8.0-repact.js (Finalized for Phase 1)

(function() {
    'use-strict';

    // =============================================================
    // 1. 설정 상수 (Configuration Constants)
    // - 스크립트의 정체성. 절대 변하지 않는 값들.
    // =============================================================
    const DEBUG_MODE = false;
    const IS_TESTER_MODE = true;
    /**
     * [신규] 개발자 모드 플래그.
     * - true: 로컬에 정의된 DynamicMenu 클래스를 직접 사용하여 테스트합니다. (빠른 개발 및 디버깅용)
     * - false: 외부 'DynamicMenu.js' 파일을 네트워크를 통해 불러와 사용합니다. (배포 환경 테스트용)
     * ※ 이 플래그는 DEBUG_MODE가 true일 때만 의미를 가집니다.
     */
    const DEVELOPER_MODE = false; // true = 내부 클래스 사용, false = 외부 모듈 로드 시도
    /**
     * [신규] 강제 논캐시(Non-Cache) 플래그.
     * - true: 모든 네트워크 요청(프롬프트, 모듈)에 캐시를 사용하지 않고 항상 최신 버전을 불러옵니다.
     * - false: 기본 캐시 정책을 따릅니다.
     * ※ 이 플래그는 DEBUG_MODE가 true일 때만 의미를 가집니다.
     */
    const FORCE_NO_CACHE = false; 

    const PROJECT_NAME = '오로라소극장';
    const VERSION = '1.2.1-stable-refactor'; // 안정화 버전 명시
    const LOG_TAG = `[${PROJECT_NAME} v${VERSION}]`;
    const BUTTON_NAME = '오로라MENU';
    const PROXY_SERVER_URL = 'https://aurorapr.vercel.app/api/proxy';

    // =============================================================
    // 2. 전역 상태 변수 (Global State Variables)
    // - 스크립트 실행 중 계속 변하는 값들.
    // =============================================================
    let isMenuLoading = false;
    let charData = '';
    let charName = '';
    const promptCache = {};
    let debounceTimer;

    // =============================================================
    // 3. 초기화될 모듈 및 엔진 선언
    // =============================================================
    let menuEngine;
    let correctorEngine; // [추가] 응답 교정 엔진 인스턴스를 저장할 변수
    let cacheManager; // [추가] 캐시 관리 엔진 인스턴스를 저장할 변수
    const logger = createLogger();

    // 초기 알림 메시지
    if (DEBUG_MODE) {
        toastr.info(LOG_TAG + ' 스크립트가 로드되었습니다.');
    }
    if (DEBUG_MODE && IS_TESTER_MODE) {
        toastr.warning(LOG_TAG + ' 🧪 테스트 모드로 실행 중입니다.');
    }

    // =============================================================
    // 4. 핵심 기능 정의 (Classes and Functions)
    // - 스크립트의 주요 기능들을 클래스와 함수로 정의.
    // =============================================================

    /**
     * 중앙화된 로깅 객체를 생성하는 함수
     */
    function createLogger() {
        return {
            debug: (message, ...args) => {
                if (DEBUG_MODE) console.log(`${LOG_TAG} ${message}`, ...args);
            },
            info: (message, ...args) => {
                console.log(`${LOG_TAG} ${message}`, ...args);
            },
            warn: (message, ...args) => {
                console.warn(`${LOG_TAG} ${message}`, ...args);
            },
            error: (message, ...args) => {
                console.error(`${LOG_TAG} ${message}`, ...args);
            },
            group: (title, content) => {
                if (DEBUG_MODE) {
                    console.groupCollapsed(`${LOG_TAG} ${title}`);
                    console.log(content);
                    console.groupEnd();
                }
            }
        };
    }

    // =============================================================
    // [신규] Phase 3: 스마트 캐싱 시스템
    // =============================================================

    /**
     * IndexedDB를 사용하여 원격 파일들을 관리하는 스마트 캐시 시스템 클래스.
     * - versions.json을 기준으로 로컬 DB와 원격 저장소를 '동기화'합니다.
     * - 추가/수정/삭제 작업을 모두 처리하여, 항상 최신 상태를 유지합니다.
     */
    class CacheManager {
        /**
         * @param {object} staticDeps - 로거, getProxiedUrl 등 외부 의존성
         */
        constructor(staticDeps) {
            this.deps = staticDeps;
            this.dbName = 'OroraCacheDB';
            this.storeName = 'files';
            this.db = null;
            this.localVersions = {}; // [추가] 초기화 시 로드된 로컬 버전 정보를 메모리에 저장
        }
        
        

        /**
         * [수정 제안] _openDB 메서드: DB 연결 실패 시 자동 복구를 시도하도록 로직 추가
         * @param {boolean} isRetry - 재시도 여부를 나타내는 내부 플래그
         * @returns {Promise<IDBDatabase>}
         */
        _openDB(isRetry = false) {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);

                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                            // 'filePath'를 키(keyPath)로 사용하는 'files' 객체 저장소를 생성합니다.
                        if (!db.objectStoreNames.contains(this.storeName)) {
                            db.createObjectStore(this.storeName, { keyPath: 'filePath' });
                        }
                    };


                request.onsuccess = (event) => {
                    this.deps.logger.debug('[CacheManager] IndexedDB 연결 성공.');
                    resolve(event.target.result);
                };

                request.onerror = (event) => {
                    this.deps.logger.error('[CacheManager] IndexedDB 연결 실패:', event.target.error);

                    // 재시도한 경우에도 실패했다면, 무한 루프를 방지하고 최종적으로 실패 처리
                    if (isRetry) {
                        reject('IndexedDB 자동 복구 후 재연결에도 실패했습니다.');
                        return;
                    }
                    
                    // 첫 실패 시, '조용한 자동 복구' 절차를 시작
                    this.deps.logger.warn('[CacheManager] DB가 손상된 것으로 보입니다. 자동 복구를 시작합니다...');
                    
                    // 기존 연결 요청을 정리
                    event.target.transaction?.abort();
                    
                    const deleteRequest = indexedDB.deleteDatabase(this.dbName);

                    deleteRequest.onsuccess = () => {
                        this.deps.logger.info('[CacheManager] 손상된 DB 삭제 완료. 연결을 재시도합니다.');
                        // DB 삭제 후, isRetry 플래그를 true로 설정하여 다시 연결 시도
                        this._openDB(true).then(resolve).catch(reject);
                    };

                    deleteRequest.onerror = (deleteEvent) => {
                        this.deps.logger.error('[CacheManager] DB 삭제 실패:', deleteEvent.target.error);
                        reject('IndexedDB 자동 복구(삭제)에 실패했습니다.');
                    };
                    
                    deleteRequest.onblocked = () => {
                        this.deps.logger.error('[CacheManager] DB 삭제가 다른 탭에 의해 차단되었습니다. 페이지를 새로고침해야 할 수 있습니다.');
                        reject('다른 탭이 DB를 사용 중이라 자동 복구에 실패했습니다.');
                    }
                };
            });
        }

        /**
         * [비공개] 로컬 DB에 저장된 모든 파일의 메타데이터(경로, 버전)를 가져옵니다.
         * @returns {Promise<object>} 파일 경로를 키, 버전을 값으로 가지는 객체
         */
        async _getAllLocalFiles() {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    const localFiles = {};
                        // DB에서 가져온 데이터를 { filePath: version } 형태의 객체로 변환합니다.
                    request.result.forEach(item => {
                        localFiles[item.filePath] = item.version;
                    });
                    resolve(localFiles);
                };

                request.onerror = (event) => reject(event.target.error);
            });
        }

        /**
         * [비공개] 특정 파일을 다운로드하여 DB에 저장(추가/수정)합니다.
         * @param {string} filePath - 저장할 파일의 경로 (예: 'functions/DynamicMenu.js')
         * @param {string} version - 저장할 파일의 버전
         */
        async _fetchAndStore(filePath, version) {
            const { logger, getProxiedUrl } = this.deps;
            try {
                const url = getProxiedUrl(filePath);
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const content = await response.text();
                
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                // 성공적으로 저장되면, 메모리에 있는 버전 정보도 갱신
                const putRequest = store.put({ filePath, version, content });
                putRequest.onsuccess = () => {
                    this.localVersions[filePath] = version;
                };
                
                logger.debug(`[CacheManager] 저장 완료: ${filePath} (v${version})`);
            } catch (error) {
                logger.error(`[CacheManager] '${filePath}' 다운로드 또는 저장 실패:`, error);
            }
        }

        /**
         * [핵심 공개 메서드 1] 캐시 시스템 초기화 및 동기화
         * - 스크립트 시작 시 단 한 번 호출되어야 합니다.
         * - 원격 versions.json과 로컬 DB를 비교하여, 추가/수정/삭제 작업을 수행합니다.
         */
        async initialize() {
            const { logger, getProxiedUrl } = this.deps;
            logger.debug('[CacheManager] 초기화를 시작합니다...');

            try {
                this.db = await this._openDB();

                    // 1. 원격 버전 정보 가져오기 (이 파일은 항상 최신 버전을 가져옴)
                const versionsUrl = getProxiedUrl('versions.json');
                const response = await fetch(versionsUrl, { cache: 'no-cache' });
                if (!response.ok) throw new Error('versions.json 로드 실패');
                const remoteVersions = await response.json();

                // [수정] 로컬 버전 정보를 가져와 클래스 속성에 저장
                this.localVersions = await this._getAllLocalFiles();
                logger.debug('[CacheManager] 원격 버전:', remoteVersions);
                logger.debug('[CacheManager] 로컬 버전:', this.localVersions);

                const remoteFiles = Object.keys(remoteVersions);
                const localFiles = Object.keys(this.localVersions);
                const tasks = []; // 모든 동기화 작업을 담을 배열

                    // 3. [동기화 작업 1: 삭제] 로컬에는 있지만 원격에는 없는 파일 삭제

                const filesToDelete = localFiles.filter(file => !remoteVersions.hasOwnProperty(file));
                if (filesToDelete.length > 0) {
                    logger.debug(`[CacheManager] 삭제할 파일 목록:`, filesToDelete);
                    const transaction = this.db.transaction([this.storeName], 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    filesToDelete.forEach(filePath => {
                        store.delete(filePath);
                        delete this.localVersions[filePath]; // 메모리에서도 삭제
                    });
                }


                    // 4. [동기화 작업 2: 추가/수정] 원격 파일을 기준으로 로컬 파일 검사
                for (const filePath of remoteFiles) {
                    const remoteVersion = remoteVersions[filePath];
                    const localVersion = this.localVersions[filePath];

                        // 로컬에 파일이 없거나, 버전이 다르면 다운로드 작업 추가
                    if (!localVersion || localVersion !== remoteVersion) {
                        const action = !localVersion ? '추가' : '업데이트';
                        logger.debug(`[CacheManager] ${action} 필요: ${filePath} (local: ${localVersion || 'N/A'}, remote: ${remoteVersion})`);
                        tasks.push(this._fetchAndStore(filePath, remoteVersion));
                    }
                }

                    // 5. 모든 추가/수정 작업을 병렬로 실행
                if (tasks.length > 0) {
                    //toastr.info('오로라 스크립트 에셋을 업데이트합니다. 잠시만 기다려주세요...');                    
                    logger.debug('오로라 스크립트 에셋을 업데이트합니다...');
                    await Promise.all(tasks);
                    //toastr.success('업데이트가 완료되었습니다!');
                    if (DEBUG_MODE || IS_TESTER_MODE) {
                        toastr.success('업데이트가 완료되었습니다!');
                    }
                }

                logger.debug('[CacheManager] 동기화 완료. 시스템이 준비되었습니다.');

            } catch (error) {
                logger.error('[CacheManager] 초기화 중 심각한 오류 발생:', error);
                toastr.error('오로라 캐시 시스템 초기화에 실패했습니다. 기존 방식으로 작동합니다.');
                this.db = null; // 오류 발생 시 DB 사용 불가 상태로 전환
            }
        }

        /**
         * [신규] 특정 파일이 캐시에 존재하는지 빠르게 확인하는 메서드
         * @param {string} filePath - 확인할 파일의 경로
         * @returns {boolean} 캐시에 파일이 있으면 true, 없으면 false
         */
        isCached(filePath) {
            // initialize()가 끝난 후, this.localVersions는 로컬 DB의 상태를
            // 정확히 반영하므로, 이 메모리 내 객체를 확인하는 것이 가장 빠릅니다.
            return this.localVersions.hasOwnProperty(filePath);
        }

        /**
         * [최종 수정] DB에서 파일 내용만 가져오는 역할로 축소 (무한 루프 방지)
         * @param {string} filePath - 가져올 파일의 경로
         * @returns {Promise<string|null>} 파일 내용 또는 null (네트워크 요청 없음)
         */
        async get(filePath) {
            // [변경] 논캐시 플래그 관련 로직을 모두 getPromptText로 이동
            if (!this.db || !filePath) return null;

            return new Promise((resolve) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(filePath);

                request.onsuccess = () => {
                    if (request.result) {
                        this.deps.logger.debug(`[Cache L2] '${filePath}' 파일을 IndexedDB에서 불러옵니다.`);
                        resolve(request.result.content);
                    } else {
                        // DB에 파일이 없으면 그냥 null을 반환. 절대 다른 함수를 호출하지 않음.
                        resolve(null);
                    }
                };

                request.onerror = (event) => {
                    this.deps.logger.error(`[CacheManager] '${filePath}' 파일 조회 실패:`, event.target.error);
                    resolve(null); // 에러 발생 시에도 null을 반환하여 시스템 중단 방지
                };
            });
        }
    }

    /**
     * [진화된 핵심] DynamicMenu 클래스: 메뉴 생성부터 프롬프트 후처리, 최종 실행까지 모두 책임지는 '메뉴 시스템 엔진'
     * 이 클래스는 외부 파일로 분리되어 동적으로 업데이트될 예정입니다.
     */
    class DynamicMenu {
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
         * [공개 메서드 1] 메뉴 UI 생성 및 표시
         * 사용자가 버튼을 클릭했을 때 호출됩니다.
         * @param {object} runtimeDeps - 실행 시점에 결정되는 동적 데이터 (예: charName)
         */
        async run(runtimeDeps) {
            this.charName = runtimeDeps.charName;
            const { logger } = this.deps;
            try {
                // 메뉴 생성에 필요한 데이터(YAML, 북마크)를 불러옵니다.
                await this.#loadDataAndParse();
                // 데이터를 기반으로 메뉴 UI를 구성하는 STscript를 조립합니다.
                const stscriptCommand = this.#buildMenuScriptBlocks();
                
                //logger.debug("✅ 동적으로 생성된 '메뉴 표시용' 스크립트:", stscriptCommand);
                logger.group("✅ 동적으로 생성된 '메뉴 표시용' 스크립트 (클릭하여 펼치기):", stscriptCommand);
                
                // 완성된 메뉴 UI 스크립트를 실행합니다.
                await this.deps.triggerSlash(stscriptCommand);
            } catch (error) {
                logger.error('DynamicMenu.run 실행 중 오류 발생:', error);
                toastr.error('메뉴 UI 생성 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
            }
        }

        /**
         * [공개 메서드 2] 사용자의 메뉴 선택 후의 모든 처리
         * handleWorldInfoUpdate에 의해 호출됩니다.
         * @param {object} globalVars - 사용자의 선택 정보가 담긴 글로벌 변수 객체
         */
        async processAction(globalVars) {
            const { logger, triggerSlash } = this.deps;
            try {
                // 후처리가 시작되면 action flag는 바로 초기화하여 중복 실행을 방지합니다.
                await triggerSlash('/flushglobalvar orora_action_flag');

                // 2. 해석가: 사용자의 선택을 해석합니다.
                const request = this.#parseRequest(globalVars.orora_selected_file);
                if (!request) return;

                // 3. 재료 조달자: 필요한 모든 프롬프트 파일을 가져옵니다.
                const promptData = await this.#fetchPrompts(request);
                if (!promptData) return;

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
                getProxiedUrl('top_prompt.txt'),
                getProxiedUrl('bottom_prompt.txt')
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

            let processedPrompt = cleanMiddlePrompt;

            // 1. 처리할 모듈들을 '식별자: 파일명' 형태로 매핑합니다.
            const moduleTriggers = {
                '## INTERACTIVE_MODULE': 'interactive_module_prompt.txt',
                '## REQUIRES_IMAGE_AVATARS': 'image_avatar_specs_prompt.txt'
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
            //logger.debug('middle 랜덤 처리 전:', processedPrompt);
            logger.group('middle 랜덤 처리 전 (클릭하여 펼치기):', processedPrompt);
            processedPrompt = this.#processCustomRandom(processedPrompt);
            //logger.debug('middle 랜덤 처리 후:', processedPrompt);
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
            logger.debug("✅ 최종 프롬프트 정규화 완료. AI 생성 요청...");
            //logger.debug("생성될 프롬프트 내용:", finalPrompt);
            logger.group("생성될 프롬프트 내용 (클릭하여 펼치기):", finalPrompt);
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
            //logger.debug("실행될 최종 STscript:", finalScript);
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
    
    /**
     * [신규] ResponseCorrector 클래스: 렌더링된 AI 응답을 후처리하는 '응답 교정 엔진'
     * 이 클래스는 향후 외부 파일로 분리되어 동적으로 업데이트될 예정입니다.
     */
    class ResponseCorrector {
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
                //logger.debug('[ResponseCorrector] 원본 메시지 내용:', originalText);
                logger.group('[ResponseCorrector] 원본 메시지 내용 (클릭하여 펼치기):', originalText);

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

    /**
     * [Phase 3 수정] 외부 JavaScript 모듈을 동적으로 로드하고 실행하는 함수.
     * - 네트워크(fetch) 대신 cacheManager.get()을 사용하여 파일 내용을 가져옵니다.
     * - 이를 통해 캐시 우선 조회, 버전 관리, 논캐시 옵션 처리가 자동으로 이루어집니다.
     */
    async function loadExternalModule(url) {
        const fileName = url.split('?file=')[1].split('&')[0];
        logger.debug(`[ModuleLoader] 외부 모듈 로딩 시도: ${fileName}`);// 오류 메시지에 표시할 파일 이름 추출

        try {
            // [핵심 변경] fetch 대신 cacheManager를 통해 파일 내용을 가져옵니다.
            const codeAsText = await cacheManager.get(fileName);

            // 파일 내용을 가져오지 못하면 오류를 발생시킵니다.
            if (!codeAsText) {
                throw new Error(`'${fileName}' 파일 내용을 캐시 또는 네트워크에서 가져올 수 없습니다.`);
            }
            
            // new Function()을 통해 텍스트를 실제 코드로 변환하고 클래스 정의를 반환받습니다.
            return new Function(codeAsText)();

        } catch (error) {
                // 4. 네트워크 오류, 코드 실행(파싱) 오류 등 모든 문제를 여기서 잡아 상위로 전파합니다.
            logger.error(`[ModuleLoader] '${fileName}' 로딩 중 심각한 오류 발생:`, error);
            // 상위 catch 블록에서 오류 원인을 명확히 알 수 있도록, 기존 오류 메시지를 포함하여 새로운 오류를 던집니다.
            throw new Error(`'${fileName}' 모듈을 불러오는 데 실패했습니다. (${error.message})`);
        }
    }


    /**
     * 스크립트가 로드될 때 단 한 번 실행되어, 모든 사전 작업을 처리하는 초기화 함수입니다.
     * [수정] DEVELOPER_MODE 플래그를 확인하여 메뉴 엔진 로딩 방식을 분기합니다.
     * [개선] 모든 모듈에 범용적으로 전달할 수 있는 통합 의존성 객체(staticDeps)를 사용합니다.
     */
    /**
     * [Phase 3 수정]
     * 1. CacheManager를 가장 먼저 초기화하여 '워밍업'을 수행합니다.
     * 2. 모든 의존성(cacheManager 포함)을 staticDeps에 통합하여 관리합니다.
     * 3. 이후의 모듈 로딩은 CacheManager를 통해 이루어집니다.
     */
    async function initializeScript() {
        try {
            logger.debug("스크립트 초기화를 시작합니다...");

            // 모든 정적 의존성을 하나의 객체로 통합하여 관리합니다.
            const staticDeps = {
                    // 로깅 유틸리티
                    logger: logger,
                    // 주석 제거 함수
                    removeCommentLines: removeCommentLines,
                    // 프록시 URL 생성기
                    getProxiedUrl: getProxiedUrl,
                    // 원격 텍스트 파일 로더
                    getPromptText: getPromptText,
                    // Tavern 전역 변수 접근 API
                    getVariables: getVariables,
                    // Tavern 채팅 메시지 접근 API
                    getChatMessages: getChatMessages,
                    setChatMessages: setChatMessages,
                    // Tavern 슬래시 커맨드 실행 API
                    triggerSlash: triggerSlash
            };
            
            // [핵심] 1. CacheManager를 생성하고 초기화(동기화)합니다.
            // 이 과정이 끝나야 다른 모듈들이 캐시를 사용할 수 있습니다.
            cacheManager = new CacheManager(staticDeps);
            await cacheManager.initialize();

            // 2. 이제 캐시를 통해 핵심 엔진 클래스들을 불러옵니다.
            let MenuEngineClass;
            let CorrectorEngineClass;

            if (DEBUG_MODE && DEVELOPER_MODE) {
                logger.debug("🛠️ 개발자 모드: 로컬 클래스를 사용합니다.");
                MenuEngineClass = DynamicMenu; // 코드 파일 내에 있는 클래스를 직접 할당
                CorrectorEngineClass = ResponseCorrector;
            } else {
                logger.debug("🌍 배포 모드: 외부 모듈을 로드합니다.");
                try {
                    // [변경] loadExternalModule은 이제 내부적으로 cacheManager.get을 사용합니다.
                    MenuEngineClass = await loadExternalModule(getProxiedUrl('functions/DynamicMenu.js'));
                    CorrectorEngineClass = await loadExternalModule(getProxiedUrl('functions/ResponseCorrector.js'));
                    logger.debug("✅ 외부 핵심 모듈 로딩에 성공했습니다.");

                } catch (e) {
                    logger.error("스크립트 핵심 모듈 로딩 실패:", e.message);
                    toastr.error(`오로라 스크립트의 핵심 파일을 불러오는 데 실패했습니다.\n\n오류: ${e.message}\n\n인터넷 연결 상태를 확인하거나 개발자에게 문의해주세요.`);
                    return;
                }
            }
            
            // 3. 엔진들을 초기화합니다.
            if (!MenuEngineClass) throw new Error("메뉴 엔진 클래스를 로드할 수 없습니다.");
            menuEngine = new MenuEngineClass(staticDeps);
            
            if (!CorrectorEngineClass) throw new Error("응답 교정 엔진 클래스를 로드할 수 없습니다.");
            correctorEngine = new CorrectorEngineClass(staticDeps);

            logger.debug("🚀 메뉴 엔진 및 응답 교정 엔진이 성공적으로 초기화되었습니다. 스크립트가 준비되었습니다.");
            
        } catch (error) {
            logger.error("스크립트 초기화 중 심각한 오류가 발생했습니다:", error);
            toastr.error("오로라 스크립트 초기화에 실패했습니다. F12 콘솔을 확인해주세요.");
        }
    }

    // --- 이하 글로벌 헬퍼 함수들 (외부에 존재해야 하는 함수) ---

    async function initializeCharacter() {
        logger.debug(`캐릭터 정보 초기화를 시작합니다.`);
        try {
            charData = await getCharData();
            if (!charData || !charData.name) {
                logger.error('캐릭터 정보를 가져오는 데 실패했습니다.');
                toastr.error('현재 캐릭터 정보를 가져올 수 없습니다.');
                return false;
            }
            charName = charData.name;
            logger.debug(`현재 캐릭터: ${charName}`);
            return true;
        } catch (error) {
            logger.error('캐릭터 초기화 중 오류 발생:', error);
            toastr.error('캐릭터 정보를 가져오는 중 오류가 발생했습니다.');
            return false;
        }
    }

    function getProxiedUrl(filePath) {
        const branch = IS_TESTER_MODE ? 'dev' : 'main';
        let finalUrl = `${PROXY_SERVER_URL}?file=${filePath}&branch=${branch}`;
    
        // 디버그 모드이고 강제 논캐시 플래그가 true일 때만 캐시 버스팅 파라미터를 추가합니다.
        if (DEBUG_MODE && FORCE_NO_CACHE) {
            const cacheBuster = `&t=${new Date().getTime()}`;
            // [핵심 수정] Vercel 서버 캐시까지 무시하도록 특별 파라미터를 추가합니다.
            const noServerCache = '&cache=off';
            finalUrl += cacheBuster + noServerCache;
        }
        
        return finalUrl;
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

    /**
     * [최종 수정] 모든 캐시 로직과 네트워크 요청을 총괄하는 컨트롤 타워
     * - 2단계 캐시 전략을 사용하여 최적의 성능을 제공합니다.
     * 1. L1 캐시 (promptCache - 메모리)
     * 2. L2 캐시 (cacheManager - IndexedDB)
     * 3. 최종 수단 (네트워크 요청)
     */
    async function getPromptText(url) {
        // [중요] getProxiedUrl이 URL을 생성하므로, url 자체를 키로 사용해야 캐시가 올바르게 동작
        const fileName = url.includes('?') ? url.split('?file=')[1].split('&')[0] : url.split('/').pop();

        // 논캐시 모드일 경우, L1(메모리) 캐시만 확인하고 없으면 바로 네트워크 요청
        if (DEBUG_MODE && FORCE_NO_CACHE) {
            if (promptCache[url]) {
                logger.debug(`[Cache L1 - NoCache Mode] '${fileName}' 파일은 메모리 캐시에서 불러옵니다.`);
                return promptCache[url];
            }
            logger.debug(`[NoCache] 강제 새로고침: '${fileName}' 파일을 네트워크에서 직접 불러옵니다.`);
            return fetchDirectly(url, fileName);
        }

        // 1. L1 캐시 (메모리) 확인
        if (promptCache[url]) {
            logger.debug(`[Cache L1] '${fileName}' 파일은 메모리 캐시에서 불러옵니다.`);
            return promptCache[url];
        }

        // 2. L2 캐시 (IndexedDB) 확인
        if (cacheManager) {
            const content = await cacheManager.get(fileName);
            if (content) {
                promptCache[url] = content; // L2 -> L1으로 승격
                return content;
            }
        }
        
        // 3. 모든 캐시 실패 시 네트워크 요청
        logger.warn(`[Cache Miss] '${fileName}' 파일이 모든 캐시에 없어 네트워크로 직접 요청합니다.`);
        return fetchDirectly(url, fileName);
    }

    /**
     * [신규 헬퍼 함수] 네트워크에서 직접 파일을 fetch하는 로직
     */
    async function fetchDirectly(url, fileName) {
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`서버 응답 오류 (상태: ${response.status})`);
            const content = await response.text();
            promptCache[url] = content; // 네트워크에서 가져온 것은 항상 L1 캐시에 저장
            return content;
        } catch (error) {
            logger.error(`'${fileName}' 파일 로딩 실패 (네트워크):`, error);
            toastr.error(`${fileName} 파일 로딩에 실패했습니다.`);
            return null;
        }
    }

    // =============================================================
    // 5. 이벤트 리스너 및 메인 실행부 (Event Listeners & Entry Point)
    // =============================================================
    
    /**
     * [재구성된 핸들러] 이제 이 함수는 '감시자' 역할만 수행합니다.
     * 이벤트가 발생하면 모든 처리를 menuEngine에 위임합니다.
     */
    async function handleWorldInfoUpdate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                const globalVars = getVariables({ type: 'global' });
                if (globalVars.orora_action_flag !== 'true') {
                    return;
                }
                // 모든 책임을 menuEngine에 위임!
                await menuEngine.processAction(globalVars);
            } catch (error) {
                logger.error('handleWorldInfoUpdate 함수 실행 중 오류 발생:', error);
                toastr.error('월드 인포 업데이트 처리 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
            }
        }, 150);
    }

    /**
     * 메인 메뉴 버튼 클릭 이벤트 핸들러
     */
    eventOnButton(BUTTON_NAME, async () => {
        logger.debug(`"${BUTTON_NAME}" 버튼 클릭 감지됨.`);
        if (isMenuLoading) {
            if (DEBUG_MODE) toastr.info('⏳ 메뉴를 불러오는 중입니다. 잠시만 기다려주세요.');
            return;
        }
        isMenuLoading = true;
        try {
            const isInitialized = await initializeCharacter();
            if (!isInitialized) return;

            // [최종 수정] cacheManager를 통해 'menu.yaml'이 캐시되었는지 확인합니다.
            // 캐시되어 있지 않다면 (첫 실행 등), 사용자에게 로딩 중임을 알려 연타를 방지합니다.
            if (cacheManager && !cacheManager.isCached('menu.yaml')) {
                toastr.info('⏳ 오로라 메뉴 로딩중...');
            }
            
            // 메뉴 엔진의 run 메서드를 호출하여 메뉴 UI를 표시합니다.
            await menuEngine.run({ charName: charName });

        } catch (error) {
            logger.error('메뉴 버튼 클릭 이벤트 처리 중 오류 발생:', error);
            toastr.error('메뉴를 표시하는 중 오류가 발생했습니다.'); // '메뉴' 오타 수정
        } finally {
            isMenuLoading = false;
        }
    });

    /**
     * World Info 업데이트 이벤트 리스너
     */
    eventOn(tavern_events.WORLDINFO_SETTINGS_UPDATED, handleWorldInfoUpdate);


    /**
     * [신규] AI 캐릭터 메시지 렌더링 완료 이벤트 리스너
     * 모든 처리를 correctorEngine에 위임합니다.
     */
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (message_id) => {
        // Tavern의 모든 렌더링 및 내부 업데이트가 확실히 끝난 후 실행하기 위해 setTimeout 사용
        setTimeout(async () => {
            try {
                // correctorEngine이 초기화되었다면, 모든 책임을 위임하여 실행
                if (correctorEngine) {
                    await correctorEngine.processLastMessage(message_id);
                }
            } catch (error) {
                logger.error('응답 교정 시스템 실행 중 최상위 오류 발생:', error);
                toastr.error('응답 메시지 자동 교정 중 오류가 발생했습니다. F12 콘솔을 확인하세요.');
            }
        }, 0);
    });
    
    /**
     * 스크립트의 모든 기능을 시작합니다.
     */
    initializeScript();

})();
