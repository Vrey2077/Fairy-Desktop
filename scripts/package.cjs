const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const {packager}=await import('@electron/packager');const root=path.resolve(__dirname,'..');
 const meta=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const stage=path.join(root,'work','package-stage-'+Date.now());await fs.mkdir(stage,{recursive:true});
 // Explicit application allowlist: never package the repository root or user data.
 for(const name of ['backend','electron','dist'])await fs.cp(path.join(root,name),path.join(stage,name),{recursive:true});
 for(const name of ['LICENSE.txt','NOTICE','THIRD-PARTY-NOTICES.md','PRIVACY.md'])await fs.copyFile(path.join(root,name),path.join(stage,name));
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:meta.name,version:meta.version,description:meta.description,main:meta.main,license:meta.license,author:'Fairy Desktop Contributors',private:true},null,2));
 const zipDir=path.join(root,'work','verified-electron');let hasZip=false;try{hasZip=(await fs.stat(path.join(zipDir,'electron-v44.9.0-win32-x64.zip'))).isFile();}catch{}
 const out=await packager({dir:stage,name:'Fairy',platform:'win32',arch:'x64',out:path.join(root,'release'),electronVersion:'44.9.0',icon:path.join(root,'assets/fairy.ico'),overwrite:true,tmpdir:path.join(root,'work/package-tmp'),...(hasZip?{electronZipDir:zipDir}:{}),asar:true,prune:false,download:{cacheRoot:path.join(root,'work/electron-cache')},win32metadata:{CompanyName:'Fairy Desktop Contributors',FileDescription:'Fairy Independent AI Client',ProductName:'Fairy Desktop'}});
 console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
