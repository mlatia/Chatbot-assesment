// Token comes from environment, never from an argument or committed file.
const base=process.env.LIVE_BASE_URL?.replace(/\/$/,'');
if(!base||!process.env.ADMIN_REFRESH_TOKEN)throw new Error('Set LIVE_BASE_URL and ADMIN_REFRESH_TOKEN.');
const r=await fetch(base+'/api/refresh',{method:'POST',headers:{Authorization:'Bearer '+process.env.ADMIN_REFRESH_TOKEN},signal:AbortSignal.timeout(180000)});
const result=await r.json();console.log(JSON.stringify(result,null,2));if(!r.ok)process.exitCode=1;
