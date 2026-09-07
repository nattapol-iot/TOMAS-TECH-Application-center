namespace IoTTeamCenter.Api.Models;

/* ==========================================================================
   Sales Intake & Engineer Site Visit — API contracts.

   Field names match app/system/api-client.ts one for one; System.Text.Json's
   default camelCase policy does the rest. The sales requirement block, the
   technical assessment and the site findings are separate records here for
   the same reason they are separate tables: nothing in one may overwrite
   another.
   ========================================================================== */

/* ------------------------------ Master data ------------------------------ */

public sealed record VisitTypeRecord(
    long Id, string Code, string NameEn, string NameTh, string NameJa, string Description,
    int DefaultDurationMinutes, int DefaultEngineerCount, bool RequiresManagerApproval,
    int SortOrder, bool IsActive, long? ChecklistTemplateId, string RowVersion);

public sealed record SaveVisitTypeRequest(
    string Code, string NameEn, string? NameTh, string? NameJa, string? Description,
    int DefaultDurationMinutes, int DefaultEngineerCount, bool RequiresManagerApproval,
    int SortOrder, bool IsActive, string? RowVersion);

public sealed record VisitSkillRecord(
    long Id, string Code, string NameEn, string NameTh, string NameJa, string Discipline,
    int SortOrder, bool IsActive, int EngineerCount, string RowVersion);

public sealed record SaveVisitSkillRequest(
    string Code, string NameEn, string? NameTh, string? NameJa, string? Discipline,
    int SortOrder, bool IsActive, string? RowVersion);

public sealed record ChecklistItemRecord(
    long Id, int SortOrder, string Section, string Prompt, string ResponseType,
    string Unit, bool IsRequired, string Guidance, bool IsActive);

public sealed record ChecklistTemplateRecord(
    long Id, string Code, string Name, long? VisitTypeId, string? VisitTypeName,
    string Description, int Version, bool IsActive, string RowVersion,
    IReadOnlyList<ChecklistItemRecord> Items);

public sealed record SaveChecklistTemplateRequest(
    string Code, string Name, long? VisitTypeId, string? Description, bool IsActive,
    string? RowVersion, IReadOnlyList<SaveChecklistItemRequest> Items);

public sealed record SaveChecklistItemRequest(
    int SortOrder, string Section, string Prompt, string ResponseType,
    string? Unit, bool IsRequired, string? Guidance);

public sealed record SlaPolicyRecord(
    long Id, string Code, string Name, long? VisitTypeId, string? VisitTypeName,
    int ReviewResponseDays, int ScheduleLeadDays, int ReportDueDays, int ReportWarningHours,
    bool IsDefault, bool IsActive, string RowVersion);

public sealed record SaveSlaPolicyRequest(
    string Code, string Name, long? VisitTypeId, int ReviewResponseDays, int ScheduleLeadDays,
    int ReportDueDays, int ReportWarningHours, bool IsDefault, bool IsActive, string? RowVersion);

public sealed record EngineerSkillRecord(
    long Id, long UserId, string UserName, string Department, long SkillId, string SkillCode,
    string SkillName, string Proficiency, string Note, string RowVersion);

public sealed record SaveEngineerSkillRequest(long UserId, long SkillId, string Proficiency, string? Note);

public sealed record EngineerAvailabilityRecord(
    long Id, long UserId, string UserName, string Kind, string Reason,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, string RowVersion);

public sealed record SaveEngineerAvailabilityRequest(
    long UserId, string Kind, string? Reason, DateTimeOffset StartsAt, DateTimeOffset EndsAt);

public sealed record CustomerSiteRecord(
    long Id, long CustomerId, string CustomerName, string Code, string Name, string Branch,
    string Address, string Province, string Country, decimal? Latitude, decimal? Longitude,
    int TravelMinutes, string AccessNote, bool IsActive, string RowVersion,
    IReadOnlyList<CustomerSiteContactRecord> Contacts);

public sealed record CustomerSiteContactRecord(
    long Id, long SiteId, string Name, string Department, string Position,
    string Phone, string Email, string PreferredChannel, bool IsPrimary, bool IsActive, string RowVersion);

public sealed record SaveCustomerSiteRequest(
    long CustomerId, string Code, string Name, string? Branch, string? Address, string? Province,
    string? Country, decimal? Latitude, decimal? Longitude, int TravelMinutes, string? AccessNote,
    bool IsActive, string? RowVersion);

public sealed record SaveCustomerSiteContactRequest(
    string Name, string? Department, string? Position, string? Phone, string? Email,
    string? PreferredChannel, bool IsPrimary, bool IsActive, string? RowVersion);

/* ------------------------------ Sales intake ----------------------------- */

public sealed record SalesIntakeSummary(
    long Id, string Number, string Status, long CustomerId, string CustomerName,
    string SiteName, string Subject, DateOnly RequestDate, long SalesOwnerId, string SalesOwnerName,
    string Priority, DateOnly? RequiredResponseDate, int ReadinessScore, int BlockerCount, int WarningCount,
    int PurposeCount, int AttachmentCount, long? VisitId, string? VisitNumber, string? VisitStatus,
    DateTimeOffset? ScheduledStart, DateTimeOffset UpdatedAt, string RowVersion, bool IsArchived);

public sealed record SalesIntakeRequirement(
    string ProblemStatement, string DesiredCapability, string ExpectedResult, string ExpectedScope,
    string OutOfScope, string ExistingProcess, string CurrentPainPoint, string TargetCycleTime,
    string ProductInformation, string QualityRequirement, string SpecialRequirement, string BudgetRange,
    string ExpectedTimeline, string CompetitorInformation, string AdditionalNotes);

public sealed record SalesIntakeMachine(
    string MachineName, string MachineModel, string MachineSerialNo, string Manufacturer,
    string ExistingSystem, string ControllerBrand, string AvailableDrawing, string UtilityInformation,
    string InstallationArea, string SpaceLimitation, string WorkingEnvironment, string SafetyRequirement,
    string ProductionSchedule, string ShutdownWindow, string PpeRequirement, string SiteAccessRequirement,
    bool PhotographyRestricted, bool NdaRequired);

public sealed record SalesIntakeContact(
    long? SiteId, long? SiteContactId, string CustomerBranch, string SiteName, string SiteAddress,
    string ContactName, string ContactDepartment, string ContactPosition, string ContactPhone,
    string ContactEmail, string ContactChannel);

public sealed record IntakeWindowRecord(
    long Id, DateTimeOffset StartsAt, DateTimeOffset EndsAt, int Preference, string Note);

public sealed record IntakePurposeRecord(long VisitTypeId, string Code, string Name, string Note);

public sealed record IntakeSkillRecord(long SkillId, string Code, string Name, string Source, bool IsMandatory, string Note);

public sealed record IntakeAttachmentRecord(
    long Id, string Name, string Category, string Description, int Version, string ContentType,
    long SizeBytes, string ScanStatus, string UploadedByName, DateTimeOffset UploadedAt, string RowVersion);

public sealed record IntakeReviewRecord(
    long Id, long ReviewerId, string ReviewerName, string Decision, string Comment, string VisitScope,
    int EngineerCount, int EstimatedDurationMinutes, string RequiredEquipment, string RiskAssessment,
    string SafetyConcern, bool RequiresManagerApproval, string? ManagerApprovedByName,
    DateTimeOffset? ManagerApprovedAt, string MissingInformation, int ReadinessScoreAtReview,
    DateTimeOffset CreatedAt);

public sealed record StatusHistoryRecord(
    long Id, string EntityType, long EntityId, string EntityNumber, string? PreviousStatus,
    string NewStatus, string? Reason, string ChangedByName, DateTimeOffset ChangedAt);

public sealed record ReadinessCheckResult(string Key, string Label, int Weight, string Severity, string Hint, bool Passed);

public sealed record ReadinessResult(int Score, int BlockerCount, int WarningCount, bool CanSubmit,
    IReadOnlyList<ReadinessCheckResult> Checks);

public sealed record DuplicateReferenceRecord(long Id, string Number, string Subject, DateOnly RequestDate, string Status);

public sealed record TraceabilityLinkRecord(
    long Id, string SourceType, long SourceId, string TargetType, long TargetId,
    string TargetNumber, string Relation, string Note, string CreatedByName, DateTimeOffset CreatedAt);

public sealed record SalesIntakeDetail(
    long Id, string Number, string Status, long CustomerId, string CustomerCode, string CustomerName,
    string Subject, string CustomerReferenceNo, DateOnly RequestDate, long SalesOwnerId, string SalesOwnerName,
    string Priority, DateOnly? RequiredResponseDate, DateOnly? CustomerExpectedCompletion, string Source,
    long? RelatedInquiryId, string? RelatedInquiryNumber, long? RelatedProjectId, string? RelatedProjectNumber,
    SalesIntakeContact Contact, SalesIntakeRequirement Requirement, SalesIntakeMachine Machine,
    int ReadinessScore, int BlockerCount, int WarningCount,
    DateTimeOffset? SubmittedAt, string? SubmittedByName, string Department,
    string CreatedByName, DateTimeOffset CreatedAt, string UpdatedByName, DateTimeOffset UpdatedAt,
    bool IsArchived, string RowVersion,
    IReadOnlyList<IntakePurposeRecord> Purposes,
    IReadOnlyList<IntakeSkillRecord> Skills,
    IReadOnlyList<IntakeWindowRecord> Windows,
    IReadOnlyList<IntakeAttachmentRecord> Attachments,
    IReadOnlyList<IntakeReviewRecord> Reviews,
    IReadOnlyList<SiteVisitSummary> Visits,
    IReadOnlyList<StatusHistoryRecord> StatusHistory,
    IReadOnlyList<TraceabilityLinkRecord> Links,
    IReadOnlyList<DuplicateReferenceRecord> DuplicateReferences,
    ReadinessResult Readiness,
    IReadOnlyList<string> AllowedTransitions);

public sealed record SaveSalesIntakeRequest(
    long CustomerId, string Subject, string? CustomerReferenceNo, DateOnly? RequestDate,
    long SalesOwnerId, string Priority, DateOnly? RequiredResponseDate,
    DateOnly? CustomerExpectedCompletion, string Source, long? RelatedInquiryId, long? RelatedProjectId,
    SalesIntakeContact Contact, SalesIntakeRequirement Requirement, SalesIntakeMachine Machine,
    IReadOnlyList<long> VisitTypeIds, IReadOnlyList<long> SkillIds,
    IReadOnlyList<SaveIntakeWindowRequest> Windows, string? RowVersion);

public sealed record SaveIntakeWindowRequest(DateTimeOffset StartsAt, DateTimeOffset EndsAt, int Preference, string? Note);

public sealed record ChangeStatusRequest(string Status, string? Reason, string RowVersion);

public sealed record SubmitTechnicalReviewRequest(
    string Decision, string? Comment, string? VisitScope, int EngineerCount, int EstimatedDurationMinutes,
    string? RequiredEquipment, string? RiskAssessment, string? SafetyConcern, bool RequiresManagerApproval,
    IReadOnlyList<long>? SkillIds, string RowVersion);

/* ------------------------------- Site visit ------------------------------ */

public sealed record SiteVisitSummary(
    long Id, string Number, long IntakeId, string IntakeNumber, string Status,
    long CustomerId, string CustomerName, string SiteName, string Subject,
    long VisitTypeId, string VisitTypeName,
    DateTimeOffset? ScheduledStart, DateTimeOffset? ScheduledEnd, string TimeZoneId,
    int RequiredEngineerCount, int AssignedCount, int AcceptedCount,
    string? LeadEngineerName, string EngineerNames,
    bool EngineerConfirmed, bool CustomerConfirmed,
    DateTimeOffset? CheckedInAt, DateTimeOffset? CheckedOutAt,
    DateTimeOffset? ReportDueAt, string? ReportStatus, string ReportSlaState,
    int SkillMatchPercent, DateTimeOffset UpdatedAt, string RowVersion, bool IsArchived);

public sealed record VisitAssignmentRecord(
    long Id, long EngineerId, string EngineerName, string Department, string AssignmentRole,
    string Status, int SkillMatchPercent, IReadOnlyList<string> Skills, IReadOnlyList<string> MissingSkills,
    bool ConflictOverride, string? OverrideReason, string? OverrideByName, DateTimeOffset? OverrideAt,
    DateTimeOffset? RespondedAt, string? ResponseNote, DateTimeOffset? ProposedStart, DateTimeOffset? ProposedEnd,
    bool IsActive, string AssignedByName, DateTimeOffset AssignedAt, string RowVersion);

public sealed record VisitConfirmationRecord(
    long Id, string Party, string Outcome, string Channel, string ConfirmedByName,
    DateTimeOffset ConfirmedAt, string Comment, long? EvidenceAttachmentId,
    string RecordedByName, DateTimeOffset RecordedAt);

public sealed record VisitScheduleHistoryRecord(
    long Id, DateTimeOffset? PreviousStart, DateTimeOffset? PreviousEnd,
    DateTimeOffset? NewStart, DateTimeOffset? NewEnd, string Reason,
    string ChangedByName, DateTimeOffset ChangedAt);

public sealed record VisitChecklistResponseRecord(
    long ItemId, int SortOrder, string Section, string Prompt, string ResponseType, string ItemUnit,
    bool IsRequired, string Guidance, long? ResponseId, string? ResponseValue, decimal? NumericValue,
    string Unit, bool IsNotApplicable, string? Note, string? AnsweredByName, DateTimeOffset? AnsweredAt,
    string? RowVersion);

public sealed record VisitFindingRecord(
    long Id, string Kind, string Title, string Detail, decimal? MeasurementValue, string MeasurementUnit,
    string Severity, int SortOrder, string CreatedByName, DateTimeOffset CreatedAt, string RowVersion);

public sealed record SaveVisitFindingRequest(
    string Kind, string Title, string? Detail, decimal? MeasurementValue, string? MeasurementUnit,
    string Severity, int SortOrder, string? RowVersion);

public sealed record VisitAttachmentRecord(
    long Id, long? FindingId, string Name, string Category, string Description, int Version,
    string ContentType, long SizeBytes, string ScanStatus, string UploadedByName,
    DateTimeOffset UploadedAt, string RowVersion);

public sealed record VisitActionItemRecord(
    long Id, string Title, string Detail, long? OwnerId, string OwnerName, DateOnly? DueDate,
    string Status, DateTimeOffset? CompletedAt, string CreatedByName, DateTimeOffset CreatedAt, string RowVersion);

public sealed record SaveVisitActionItemRequest(
    string Title, string? Detail, long? OwnerId, string? OwnerName, DateOnly? DueDate,
    string Status, string? RowVersion);

public sealed record VisitReportRevisionRecord(
    long Id, int Revision, string Status, string VisitSummary, string CustomerRequirement,
    string ExistingCondition, string FindingsSummary, string MeasurementSummary, string RootCause,
    string RecommendedSolution, string ProposedScope, string Assumption, string Exclusion, string Risk,
    string SafetyConcern, string CustomerAdditionalRequest, string EngineerConclusion,
    string SalesFollowUp, string NextStep, string ChangeSummary,
    string CreatedByName, DateTimeOffset CreatedAt, string? ApprovedByName, DateTimeOffset? ApprovedAt,
    string RowVersion);

public sealed record VisitReportRecord(
    long Id, string Number, long VisitId, string VisitNumber, string Status, int CurrentRevision,
    long AuthorId, string AuthorName, DateTimeOffset? SubmittedAt, string? ReviewedByName,
    DateTimeOffset? ReviewedAt, string ReviewComment, string CustomerAcknowledgedBy,
    DateTimeOffset? CustomerAcknowledgedAt, bool HasCustomerSignature, DateTimeOffset? DueAt,
    string SlaState, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string RowVersion,
    VisitReportRevisionRecord? Current, IReadOnlyList<VisitReportRevisionRecord> Revisions);

public sealed record SaveVisitReportRequest(
    string? VisitSummary, string? CustomerRequirement, string? ExistingCondition, string? FindingsSummary,
    string? MeasurementSummary, string? RootCause, string? RecommendedSolution, string? ProposedScope,
    string? Assumption, string? Exclusion, string? Risk, string? SafetyConcern,
    string? CustomerAdditionalRequest, string? EngineerConclusion, string? SalesFollowUp, string? NextStep,
    string? ChangeSummary, string RowVersion);

public sealed record ReviewVisitReportRequest(string Decision, string? Comment, string RowVersion);

public sealed record AcknowledgeVisitReportRequest(string AcknowledgedBy, DateTimeOffset? AcknowledgedAt, string? SignatureDataUrl, string RowVersion);

public sealed record SiteVisitDetail(
    long Id, string Number, string Status, long IntakeId, string IntakeNumber, string IntakeSubject,
    long CustomerId, string CustomerCode, string CustomerName, string SiteName, string SiteAddress,
    string ContactName, string ContactPhone, string ContactEmail,
    long VisitTypeId, string VisitTypeName, long? ChecklistTemplateId, string? ChecklistTemplateName,
    long? SlaPolicyId, string? SlaPolicyName, int ReportDueDays,
    DateTimeOffset? ScheduledStart, DateTimeOffset? ScheduledEnd, string TimeZoneId,
    int TravelMinutesBefore, int TravelMinutesAfter, string MeetingPoint, string RequiredEquipment,
    string InternalNote, string CustomerNote, int RequiredEngineerCount,
    DateTimeOffset? EngineerConfirmedAt, DateTimeOffset? CustomerConfirmedAt,
    DateTimeOffset? CheckedInAt, string? CheckedInByName, decimal? CheckInLatitude, decimal? CheckInLongitude,
    bool LocationConsentGiven, DateTimeOffset? CheckedOutAt, string? CheckedOutByName,
    string ActualAttendees, string CustomerAttendees, string ExecutionNote,
    DateTimeOffset? ReportDueAt, string ReportSlaState, DateTimeOffset? ClosedAt, string? ClosedByName, string CloseReason,
    string Department, string CreatedByName, DateTimeOffset CreatedAt, string UpdatedByName, DateTimeOffset UpdatedAt,
    bool IsArchived, string RowVersion,
    IReadOnlyList<string> RequiredSkills, int TeamSkillMatchPercent, IReadOnlyList<string> MissingSkills,
    IReadOnlyList<VisitAssignmentRecord> Assignments,
    IReadOnlyList<VisitConfirmationRecord> Confirmations,
    IReadOnlyList<VisitScheduleHistoryRecord> ScheduleHistory,
    IReadOnlyList<VisitChecklistResponseRecord> Checklist,
    IReadOnlyList<VisitFindingRecord> Findings,
    IReadOnlyList<VisitAttachmentRecord> Attachments,
    IReadOnlyList<VisitActionItemRecord> ActionItems,
    IReadOnlyList<StatusHistoryRecord> StatusHistory,
    IReadOnlyList<TraceabilityLinkRecord> Links,
    VisitReportRecord? Report,
    IReadOnlyList<string> AllowedTransitions,
    bool CanExecute);

public sealed record CreateSiteVisitRequest(
    long IntakeId, long VisitTypeId, long? ChecklistTemplateId, long? ProposedWindowId,
    DateTimeOffset? ScheduledStart, DateTimeOffset? ScheduledEnd, string? TimeZoneId,
    int TravelMinutesBefore, int TravelMinutesAfter, string? MeetingPoint, string? RequiredEquipment,
    string? InternalNote, string? CustomerNote, int RequiredEngineerCount);

public sealed record RescheduleVisitRequest(
    DateTimeOffset ScheduledStart, DateTimeOffset ScheduledEnd, string? TimeZoneId,
    int TravelMinutesBefore, int TravelMinutesAfter, string? MeetingPoint, string Reason, string RowVersion);

public sealed record AssignEngineerRequest(
    long EngineerId, string AssignmentRole, bool ConflictOverride, string? OverrideReason, string RowVersion);

public sealed record RespondToAssignmentRequest(
    string Response, string? Note, DateTimeOffset? ProposedStart, DateTimeOffset? ProposedEnd, string RowVersion);

public sealed record RecordConfirmationRequest(
    string Party, string Outcome, string Channel, string? ConfirmedByName,
    DateTimeOffset? ConfirmedAt, string? Comment, long? EvidenceAttachmentId, string RowVersion);

public sealed record CheckInRequest(
    string? ActualAttendees, string? CustomerAttendees, bool LocationConsentGiven,
    decimal? Latitude, decimal? Longitude, string RowVersion);

public sealed record CheckOutRequest(string? ExecutionNote, string RowVersion);

public sealed record SaveChecklistResponseRequest(
    long ChecklistItemId, string? ResponseValue, decimal? NumericValue, string? Unit,
    bool IsNotApplicable, string? Note);

public sealed record CloseVisitRequest(string Reason, string RowVersion);

/* --------------------------- Availability & calendar --------------------- */

public sealed record EngineerCandidateRecord(
    long Id, string Name, string Email, string Department, string Role,
    IReadOnlyList<string> Skills, int SkillMatchPercent, IReadOnlyList<string> MissingSkills,
    int OpenAssignments, int ScheduledMinutesInWindow, int ConflictCount, string ConflictDetail,
    int TravelMinutes, bool IsActive, bool IsAssigned);

public sealed record CalendarEntryRecord(
    long VisitId, string VisitNumber, string Status, string CustomerName, string SiteName,
    string VisitTypeName, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    int TravelMinutesBefore, int TravelMinutesAfter,
    IReadOnlyList<long> EngineerIds, string EngineerNames);

public sealed record CalendarUnavailableRecord(
    long Id, long UserId, string UserName, string Kind, string Reason,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt);

public sealed record CalendarResult(
    DateTimeOffset From, DateTimeOffset To,
    IReadOnlyList<CalendarEntryRecord> Visits,
    IReadOnlyList<CalendarUnavailableRecord> Unavailable);

/* ------------------------------ Pre-visit brief -------------------------- */

public sealed record PreviousVisitRecord(
    long Id, string Number, string VisitTypeName, string Status,
    DateTimeOffset? ScheduledStart, string EngineerNames, string? ReportStatus);

public sealed record PreVisitBriefRecord(
    SiteVisitDetail Visit,
    SalesIntakeRequirement Requirement,
    SalesIntakeMachine Machine,
    IReadOnlyList<IntakePurposeRecord> Purposes,
    IReadOnlyList<IntakeAttachmentRecord> IntakeAttachments,
    IReadOnlyList<string> OpenQuestions,
    IReadOnlyList<PreviousVisitRecord> PreviousVisits,
    string EmergencyContact);

/* ------------------------------- My work --------------------------------- */

public sealed record MyAssignmentRecord(
    long VisitId, string VisitNumber, string VisitStatus, long AssignmentId, string AssignmentStatus,
    string AssignmentRole, string CustomerName, string SiteName, string SiteAddress, string Subject,
    string VisitTypeName, DateTimeOffset? ScheduledStart, DateTimeOffset? ScheduledEnd,
    string ContactName, string ContactPhone, DateTimeOffset? CheckedInAt, DateTimeOffset? CheckedOutAt,
    DateTimeOffset? ReportDueAt, string ReportSlaState, string? ReportStatus, int SkillMatchPercent,
    string RowVersion, string AssignmentRowVersion);

/* ----------------------------- Linking outward --------------------------- */

public sealed record CreateInquiryFromVisitRequest(
    string ProjectName, string ProjectType, long EstimateOwnerId, DateOnly DueDate,
    string Priority, int ProjectProbability, string CustomerInterestGrade, string? Remark);

public sealed record LinkRecordRequest(string TargetType, long TargetId, string? Relation, string? Note);

/* ------------------------------- Dashboards ------------------------------ */

public sealed record CountByLabel(string Label, long Value);

public sealed record SalesVisitDashboard(
    long IntakesCreated, long PendingTechnicalReview, long MoreInformationRequired,
    long WaitingCustomerConfirmation, long UpcomingVisits, long CompletedVisits,
    long WaitingReport, long ConvertedToInquiry, long ConvertedToEstimate,
    IReadOnlyList<CountByLabel> ByStatus, IReadOnlyList<SalesIntakeSummary> Attention);

public sealed record EngineeringVisitDashboard(
    long AwaitingAssignment, long AwaitingConfirmation, long VisitsToday, long VisitsThisWeek,
    long ScheduleConflicts, long ReportsOverdue,
    IReadOnlyList<CountByLabel> WorkloadByEngineer,
    IReadOnlyList<CountByLabel> SkillDemand,
    IReadOnlyList<SiteVisitSummary> Attention);

public sealed record ManagementVisitDashboard(
    long TotalIntakes, long TotalVisits, decimal AverageLeadTimeDays, decimal CompletionRatePercent,
    decimal ReportSlaCompliancePercent, decimal VisitToEstimateConversionPercent,
    decimal VisitToProjectConversionPercent, decimal CancelledRatePercent,
    decimal RescheduledRatePercent, decimal NoShowRatePercent,
    IReadOnlyList<CountByLabel> ByCustomer, IReadOnlyList<CountByLabel> BySalesOwner,
    IReadOnlyList<CountByLabel> ByEngineer, IReadOnlyList<CountByLabel> ByDepartment,
    IReadOnlyList<CountByLabel> ByVisitType);

/* ----------------------------- Notifications ----------------------------- */

public sealed record NotificationRecord(
    long Id, string Kind, string Title, string Detail, string? EntityType, long? EntityId,
    bool IsRead, DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);

public sealed record MarkNotificationsReadRequest(IReadOnlyList<long> Ids, bool All);
