import {Database} from "file:///C:/Users/natta/AppData/Local/IoTTeamCenter/TeamTest/releases/20260905-104136-resource/dist/src/db.js";
import {buildApp} from "file:///C:/Users/natta/AppData/Local/IoTTeamCenter/TeamTest/releases/20260905-104136-resource/dist/src/app.js";
import {loadConfig} from "file:///C:/Users/natta/AppData/Local/IoTTeamCenter/TeamTest/releases/20260905-104136-resource/dist/src/config.js";
const db=new Database({connectionString:process.env.RESOURCE_DIAG_CONNECTION,applicationRoleName:"iot_team_app_uat",applicationRolePassword:process.env.RESOURCE_DIAG_ROLE,trustServerCertificate:true});
try {
  for(let i=0;i<4;i++) {
    const start=Date.now(); await Promise.all(Array.from({length:8},()=>db.query("SELECT 1 AS ready")));
    console.log(JSON.stringify({batch:i+1,queries:8,ms:Date.now()-start}));
  }
} finally {await db.close();}
const config=loadConfig({NODE_ENV:"staging",Authentication__Mode:"TeamTest",
  Authentication__TeamTestSigningKey:"diagnostic-only-not-a-real-team-key-0123456789",
  AllowedHosts:"localhost;127.0.0.1","Cors__AllowedOrigins__0":"https://localhost",
  Database__TrustServerCertificateForTeamTest:"true",
  ConnectionStrings__IoTTeamCenter:process.env.RESOURCE_DIAG_CONNECTION,DocumentStorage__RootPath:".",
  Database__ApplicationRoleName:"iot_team_app_uat",Database__ApplicationRolePassword:process.env.RESOURCE_DIAG_ROLE});
const {app}=await buildApp(config);
try {
  for(let i=0;i<3;i++){const start=Date.now();const response=await app.inject({url:"/health/ready"});console.log(JSON.stringify({http:response.statusCode,ms:Date.now()-start}));}
}finally{await app.close();}
