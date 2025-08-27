// 이 파일 하나가 우리의 프록시 서버 전체입니다.
export default async function handler(request, response) {
  
  // 1. 스크립트가 보내는 요청에서 '?file=' 뒤의 파일 경로를 읽습니다.
  // 예: /api/proxy?file=orora/daily.txt  -> 'orora/daily.txt'
  const filePath = request.query.file;

  // 파일 경로가 없으면 오류 메시지를 보냅니다.
  if (!filePath) {
    return response.status(400).send('Error: file parameter is missing.');
  }

  // 2. 실제 프롬프트가 저장된 GitHub Raw 파일의 URL을 조립합니다.
  // ★★ 이 부분의 '사용자이름/저장소이름'을 당신의 정보로 바꾸세요. ★★
  const targetUrl = `https://rosh00190.github.io/aurorapr/${filePath}`;




  try {
    // 3. Vercel 서버가 당신을 대신해 GitHub로 파일을 요청합니다.
    const githubResponse = await fetch(targetUrl);

    // GitHub에서 파일을 찾지 못하는 등 문제가 생기면 오류를 그대로 전달합니다.
    if (!githubResponse.ok) {
      return response.status(githubResponse.status).send(githubResponse.statusText);
    }

    // 4. GitHub로부터 성공적으로 받아온 파일 내용을 스크립트에게 전달합니다.
    const fileContent = await githubResponse.text();
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(200).send(fileContent);

  } catch (error) {
    // 네트워크 문제 등 예상치 못한 오류 처리
    console.error(error);
    return response.status(500).send('Proxy server internal error.');
  }
}