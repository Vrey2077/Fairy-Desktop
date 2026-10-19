const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const directories=['backend','electron','renderer','scripts','test','vendor','assets','docs','.github'];
const rootFiles=['package.json','package-lock.json','.gitignore','.gitattributes','README.md','README.en.md','CHANGELOG.md','LICENSE.txt','NOTICE','THIRD-PARTY-NOTICES.md','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','Fairy-角色提示词.txt','启动 Fairy.cmd'];
function sourceFiles(){const output=[];function walk(rel){const full=path.join(root,rel);if(!fs.existsSync(full))return;const stat=fs.lstatSync(full);if(stat.isSymbolicLink())throw Error('Symlink not permitted: '+rel);if(stat.isDirectory()){if(/(^|\/)(downloaded|data|exports|work|release|node_modules)(\/|$)/i.test(rel))throw Error('Private directory in source tree: '+rel);for(const n of fs.readdirSync(full))walk(rel+'/'+n);}else output.push(rel.replaceAll('\\','/'));}for(const rel of [...rootFiles,...directories])walk(rel);return output.sort();}
module.exports={root,sourceFiles};
if(require.main===module)console.log(sourceFiles().join('\n'));
