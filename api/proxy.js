// 이 파일 하나가 우리의 프록시 서버 전체입니다.
export default async function handler(request, response) {
  
  // ▼▼▼▼▼ [수정됨] CORS 허용 헤더 추가 ▼▼▼▼▼
  // 어느 동네(Origin)에서 온 요청이든 허용합니다.
  response.setHeader('Access-Control-Allow-Origin', '*');
  // GET과 OPTIONS 메소드 요청을 허용합니다.
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // 특정 헤더를 포함한 요청을 허용합니다.
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청은 CORS 사전 확인용이므로, 바로 200 OK로 응답합니다.
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  // ▲▲▲▲▲ [수정됨] CORS 허용 헤더 추가 ▲▲▲▲▲

  const file = request.query.file;

  const branch = request.query.branch;
  const cache = request.query.cache;
    // ▼▼▼▼▼ [수정됨] branch 쿼리 파라미터 읽기 ▼▼▼▼▼
    // 요청 URL에서 branch 값을 가져옵니다. 없으면 'main'을 기본값으로 사용합니다.
  const branchName = branch || 'main';

    // 간단한 유효성 검사: 영문, 숫자, 하이픈(-), 언더스코어(_)만 허용하여 보안 강화
    const isValidBranchName = /^[a-zA-Z0-9_-]+$/.test(branchName);
    if (!isValidBranchName) {
        return response.status(400).send('Error: Invalid branch name specified.');
    }
    // ▲▲▲▲▲ [수정됨] branch 쿼리 파라미터 읽기 ▲▲▲▲▲

  if (!file) {
    return response.status(400).send('Error: file parameter is missing.');
  }

    // ▼▼▼▼▼ [보안 강화] 허용된 파일 목록 ▼▼▼▼▼
    // 이 목록에 있는 파일 또는 이 패턴으로 시작하는 파일만 허용합니다.
    const allowedFiles = [
        'menu.yaml',
        'versions.json',
        'top_prompt.txt',
        'bottom_prompt.txt',
        'interactive_module_prompt.txt',
        'image_avatar_specs_prompt.txt'
    ];

    const allowedPrefixes = [
        'orora/', // 'orora/' 폴더 하위의 모든 파일을 허용
        'functions/' 
    ];

    const isAllowed = allowedFiles.includes(file) || 
                      allowedPrefixes.some(prefix => file.startsWith(prefix));
    
    // 경로 조작 공격 방지 (../, ./ 등 포함 시 차단)
    const containsPathTraversal = file.includes('../') || file.includes('./');

    if (!isAllowed || containsPathTraversal) {
        // 허용되지 않은 파일 요청 시 403 Forbidden 응답
        return response.status(403).send('Error: Access to this file is denied.');
    }
    // ▲▲▲▲▲ [보안 강화] 코드 끝 ▲▲▲▲▲
	
  // ★★ 이 부분의 '사용자이름/저장소이름'이 정확한지 다시 한번 확인하세요! ★★
  // 2. [404 해결] 당신의 저장소에 있는 '파일 원본(Raw) 주소'를 사용합니다.
  // ★★ 'github.io'가 아닌 'raw.githubusercontent.com'을 사용해야 합니다. ★★
 
    // 하드코딩된 'main' 대신, 파라미터로 받은 branchName을 사용합니다.
    const targetUrl = `https://raw.githubusercontent.com/rosh00190/aurorapr/${branchName}/${filePath}`;

  try {
    const githubResponse = await fetch(targetUrl);

    if (!githubResponse.ok) {
      // GitHub가 404를 반환하면, 그 상태 그대로 전달하여 원인을 파악하기 쉽게 합니다.
      return response.status(githubResponse.status).send(githubResponse.statusText);
    }

    const fileContent = await githubResponse.text();
	
	
    // --- [핵심 수정] 조건부 캐시 헤더 설정 ---
    // URL에 'cache=off' 파라미터가 있을 때만 Vercel 캐시를 비활성화합니다.
    if (cache === 'off') {
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
    }
    // 'cache=off'가 없으면, 아무런 캐시 헤더를 설정하지 않습니다.
    // -> Vercel의 기본 캐시 정책 (CDN 5~6분 캐시)이 자동으로 적용됩니다.
	
    // 이미 위에서 설정했으므로, 이 헤더는 중복될 수 있어 여기서도 명시합니다.
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(200).send(fileContent);

  } catch (error) {
    console.error(error);
    return response.status(500).send('Proxy server internal error.');
  }
}