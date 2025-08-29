export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  const filePath = request.query.file;
    const branchName = request.query.branch || 'main';
    const isValidBranchName = /^[a-zA-Z0-9_-]+$/.test(branchName);
    if (!isValidBranchName) {
        return response.status(400).send('Error: Invalid branch name specified.');
    }

  if (!filePath) {
    return response.status(400).send('Error: file parameter is missing.');
  }
    const allowedFiles = [
        'menu.yaml',
        'versions.json',
        'top_prompt.txt',
        'bottom_prompt.txt',
        'interactive_module_prompt.txt',
        'image_avatar_specs_prompt.txt'
    ];

    const allowedPrefixes = [
        'orora/' ,
        'functions/' 
    ];

    const isAllowed = allowedFiles.includes(filePath) || 
                      allowedPrefixes.some(prefix => filePath.startsWith(prefix));
    
    const containsPathTraversal = filePath.includes('../') || filePath.includes('./');

    if (!isAllowed || containsPathTraversal) {
        return response.status(403).send('Error: Access to this file is denied.');
    }
    const targetUrl = `https://raw.githubusercontent.com/rosh00190/aurorapr/${branchName}/${filePath}`;

  try {
    const githubResponse = await fetch(targetUrl);

    if (!githubResponse.ok) {
      return response.status(githubResponse.status).send(githubResponse.statusText);
    }

    const fileContent = await githubResponse.text();
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