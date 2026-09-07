import { createRoot } from "react-dom/client";
import { useState } from "react";
import { SigningPreview, SignedFilePreview } from "../../app/system/production/SigningPreview";
import "../../app/globals.css";
function Harness(){const [mode,setMode]=useState("edit");const [result,setResult]=useState("");return <><h1>TEST ONLY - no real account or signing</h1><button onClick={()=>setMode("edit")}>Edit preview</button><button onClick={()=>setMode("signed")}>Signed preview</button><pre data-testid="result">{result}</pre>{mode==="edit"?<SigningPreview documentId={1} fileId={1} stepId={1} onClose={()=>setMode("")} onConfirm={value=>{setResult(JSON.stringify(value));setMode("");}}/>:mode==="signed"?<SignedFilePreview requestId={1} onClose={()=>setMode("")}/>:null}</>}
createRoot(document.getElementById("root")!).render(<Harness/>);
