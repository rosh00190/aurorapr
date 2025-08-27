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

  const filePath = request.query.file;

  if (!filePath) {
    return response.status(400).send('Error: file parameter is missing.');
  }

  // ★★ 이 부분의 '사용자이름/저장소이름'이 정확한지 다시 한번 확인하세요! ★★
  // 2. [404 해결] 당신의 저장소에 있는 '파일 원본(Raw) 주소'를 사용합니다.
  // ★★ 'github.io'가 아닌 'raw.githubusercontent.com'을 사용해야 합니다. ★★
  const targetUrl = `https://raw.githubusercontent.com/rosh00190/aurorapr/main/${filePath}`;

  try {
    const githubResponse = await fetch(targetUrl);

    if (!githubResponse.ok) {
      // GitHub가 404를 반환하면, 그 상태 그대로 전달하여 원인을 파악하기 쉽게 합니다.
      return response.status(githubResponse.status).send(githubResponse.statusText);
    }

    const fileContent = await githubResponse.text();
    // 이미 위에서 설정했으므로, 이 헤더는 중복될 수 있어 여기서도 명시합니다.
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(200).send(fileContent);

  } catch (error) {
    console.error(error);
    return response.status(500).send('Proxy server internal error.');
  }
}
