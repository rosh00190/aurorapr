export default async function handler(request, response) {
  // --- CORS 및 기본 보안 설정 ---
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  
  // request.query에서 file, branch, cache를 안전하게 추출
  const file = request.query.file;
  const branch = request.query.branch;
  const cache = request.query.cache;
  const branchName = branch || 'main';

  // --- 유효성 검사 ---
  const isValidBranchName = /^[a-zA-Z0-9_-]+$/.test(branchName);
  if (!isValidBranchName) {
      return response.status(400).send('Error: Invalid branch name specified.');
  }
  if (!file) {
    return response.status(400).send('Error: file parameter is missing.');
  }
  const allowedFiles = [ 'menu.yaml', 'versions.json' ];
  const allowedPrefixes = [ 'orora/' , 'functions/', 'prompts/' ];
  const isAllowed = allowedFiles.includes(file) || allowedPrefixes.some(prefix => file.startsWith(prefix));
  const containsPathTraversal = file.includes('../') || file.includes('./');
  if (!isAllowed || containsPathTraversal) {
      return response.status(403).send('Error: Access to this file is denied.');
  }

  const targetUrl = `https://raw.githubusercontent.com/rosh00190/aurorapr/${branchName}/${file}`;

  try {
    const githubResponse = await fetch(targetUrl);

    if (!githubResponse.ok) {
      return response.status(githubResponse.status).send(githubResponse.statusText);
    }

    const fileContent = await githubResponse.text();

    // --- 조건부 캐시 헤더 설정 ---
    if (cache === 'off') {
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
    }

    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return response.status(200).send(fileContent);

  } catch (error) {
    console.error(error);
    return response.status(500).send('Proxy server internal error.');
  }
}