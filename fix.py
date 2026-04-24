import os
path = '/Users/canturgut/Documents/personal/home-server/server/api/chathandlers.go'
with open(path, 'r') as f:
    lines = f.readlines()
with open(path, 'w') as f:
    for line in lines:
        if 'tagRe     = regexp.MustCompile' in line:
            f.write('    tagRe     = regexp.MustCompile(`(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>`)\n')
        else:
            f.write(line)
