// Isolated UI fixture only. No auth, real API, upload or sign calls.
export async function apiRequest<T>():Promise<T>{return fetch("/fixture/preview").then(r=>r.json());}
export async function downloadSignedOutput(){return {blob:await fetch("/fixture/output").then(r=>r.blob())};}
