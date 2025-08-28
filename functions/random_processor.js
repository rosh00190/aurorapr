(function(text) {
    // 기존 processCustomRandom 함수 내용을 그대로 가져왔습니다
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

    // 내부 함수들
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
})