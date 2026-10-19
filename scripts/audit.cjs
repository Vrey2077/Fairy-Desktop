const fs=require('node:fs');const path=require('node:path');const {root,sourceFiles}=require('./source-files.cjs');
const findings=[];const patterns=[
 ['credential token',new RegExp('(sk|ghp|gho|ghu|ghs|ghr)[_-][A-Za-z0-9_-]{24,}')],
 ['GitHub PAT',new RegExp('github'+'_pat_[A-Za-z0-9_]{30,}')],
 ['private key',new RegExp('-----BEGIN '+'(?:RSA |EC |OPENSSH )?PRIVATE KEY-----')],
 ['local user path',new RegExp('[A-Z]:[\\\\/]+Users[\\\\/]+[^\\\\/\\s]+','i')],
 ['personal Linux/macOS path',new RegExp('/(?:Users|home)/[A-Za-z][^/\\s]*[/]')],
 ['embedded password URL',new RegExp('https?://[^\\s/@]+:[^\\s/@]+@')]
];
const blocked=/(^|\/)(data|exports|downloaded|chromium|node_modules|\.git|work)(\/|$)|(^|\/)(keys\.enc|state\.json|desktop-runtime\.json)|\.(enc|pem|pfx|p12|log|dmp|zip|7z)$/i;
function audit(files,base=root){for(const file of files){if(blocked.test(file))findings.push({file,rule:'private file'});if(/\.(png|ico)$/i.test(file))continue;const content=fs.readFileSync(path.join(base,file),'utf8');for(const [rule,re] of patterns)if(re.test(content))findings.push({file,rule});}return findings;}
if(require.main===module){const files=sourceFiles();audit(files);if(findings.length){console.error(JSON.stringify({passed:false,findings},null,2));process.exitCode=1;}else console.log(JSON.stringify({passed:true,files:files.length,checks:'source allowlist, credential patterns, private files and local user paths'}));}
module.exports={audit};
