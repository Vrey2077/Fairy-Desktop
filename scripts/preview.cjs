const path=require('node:path');const {createServer}=require('../backend/server.cjs');
createServer({dataDir:path.resolve(__dirname,'../work/preview-data'),webDir:path.resolve(__dirname,'../dist'),port:Number(process.env.FAIRY_PORT)||18438}).then(s=>console.log('FAIRY_URL='+s.origin)).catch(e=>{console.error(e.message);process.exit(1);});
