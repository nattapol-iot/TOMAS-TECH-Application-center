import type { InquiryDetail, SalesIntakeSummary, SaveSalesIntakeInput } from "../app/system/api-client";

/** Copy customer facts only; technical review and site safety still need a human. */
export function seedVisitRequest(base: SaveSalesIntakeInput, inquiry: InquiryDetail, salesOwnerId: number): SaveSalesIntakeInput {
  return {
    ...base, relatedInquiryId: inquiry.id, customerId: inquiry.customerId,
    subject: inquiry.projectName, customerReferenceNo: inquiry.rfqNo ?? undefined,
    salesOwnerId, priority: inquiry.priority, requiredResponseDate: inquiry.dueDate,
    customerExpectedCompletion: inquiry.targetDelivery,
    contact: { ...base.contact, contactName: inquiry.contact, siteName: inquiry.siteLocation, siteAddress: inquiry.siteLocation },
    requirement: { ...base.requirement, problemStatement: inquiry.requirement,
      expectedScope: inquiry.scopeSummary, existingProcess: inquiry.background,
      specialRequirement: inquiry.special, additionalNotes: inquiry.technical },
  };
}

/** Keep preparation and visit states separate, and explain the actual next action. */
export function visitNextAction(item: Pick<SalesIntakeSummary, "status" | "visitStatus">): string {
  if (item.status === "Cancelled") return "คำขอถูกยกเลิก";
  if (item.status === "Closed") return "ปิดคำขอแล้ว";
  if (item.visitStatus) {
    switch (item.visitStatus) {
      case "Closed": case "Completed": return "ดูผลสำรวจ · กลับ Inquiry เพื่อทำ Estimate";
      case "Cancelled": return "นัดถูกยกเลิก · ตรวจว่าต้องนัดใหม่หรือไม่";
      case "Report Pending": return "วิศวกรจัดทำ / ส่งรายงาน";
      case "In Progress": return "วิศวกรกำลังเข้าหน้างาน";
      case "Pending Customer Confirmation": return "ฝ่ายขายยืนยันนัดกับลูกค้า";
      case "Pending Engineer Confirmation": return "รอวิศวกรตอบรับ";
      case "Confirmed": return "พร้อมเข้าหน้างานตามนัด";
      default: return "ผู้ประสานงานจัดทีมและยืนยันนัด";
    }
  }
  switch (item.status) {
    case "Draft": case "More Information Required": return "ฝ่ายขายเติมข้อมูลและส่งตรวจ";
    case "Pending Technical Review": return "รอฝ่ายวิศวกรรมตรวจข้อมูล";
    case "Ready to Schedule": return "ผู้ประสานงานนัดหมายและจัดทีม";
    case "Completed": return "กลับ Inquiry เพื่อทำ Estimate";
    case "On Hold": return "พักคำขอ · ตรวจเหตุผลก่อนดำเนินการ";
    default: return "เปิดคำขอเพื่อตรวจขั้นตอนถัดไป";
  }
}
