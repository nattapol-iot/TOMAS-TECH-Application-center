import sql from "mssql/msnodesqlv8.js";
export async function issueDocumentNumber(transaction, documentType, issueDate) {
    const request = new sql.Request(transaction);
    request.input("document_type", sql.VarChar(20), documentType);
    request.input("issue_date", sql.Date, issueDate);
    request.output("document_number", sql.NVarChar(30));
    const result = await request.execute("dbo.issue_document_number");
    return String(result.output.document_number);
}
//# sourceMappingURL=document-number.js.map