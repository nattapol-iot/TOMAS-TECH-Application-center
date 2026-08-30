namespace IoTTeamCenter.Api.Models;

public sealed record CurrentUser(
    long Id,
    string EntraObjectId,
    string Email,
    string Name,
    string Role,
    string Department,
    bool IsActive);

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    long Total);

public sealed record InquirySummary(
    long Id,
    string Number,
    DateOnly InquiryDate,
    long CustomerId,
    string CustomerName,
    string ProjectName,
    string ProjectType,
    long EstimateOwnerId,
    string EstimateOwnerName,
    DateOnly DueDate,
    string Priority,
    string Status,
    decimal Progress,
    int Revision,
    DateTimeOffset UpdatedAt,
    string RowVersion,
    long? EstimateId);

public sealed record CreateInquiryRequest(
    long CustomerId,
    string Contact,
    string ProjectName,
    string ProjectType,
    string? RfqNo,
    string? SalesOwner,
    long EstimateOwnerId,
    DateOnly DueDate,
    string Priority,
    string? Requirement,
    string? Background,
    string? ScopeSummary,
    string? Technical,
    DateOnly? TargetDelivery,
    string? SiteLocation,
    string? Standard,
    string? Special,
    string? Remark);

public sealed record EstimateSummary(
    long Id,
    string Number,
    string InquiryNumber,
    long CustomerId,
    string CustomerName,
    string ProjectName,
    string ProjectType,
    long OwnerId,
    string OwnerName,
    int Revision,
    DateOnly DueDate,
    string Status,
    decimal Progress,
    decimal MaterialTotal,
    decimal EngineeringTotal,
    decimal Total,
    DateTimeOffset UpdatedAt,
    string RowVersion);

public sealed record CreateEstimateRequest(
    long InquiryId,
    long OwnerId,
    DateOnly DueDate,
    decimal ContingencyRate);

public sealed record ProjectSummary(
    long Id,
    string Number,
    string Name,
    string CustomerName,
    string Status,
    string ProjectType,
    string ManagerName,
    DateOnly StartDate,
    DateOnly TargetDelivery,
    decimal Progress,
    DateTimeOffset UpdatedAt,
    string RowVersion);

public sealed record CreateProjectRequest(
    long EstimateId,
    string PurchaseOrderNumber,
    DateOnly PurchaseOrderDate,
    long ManagerId,
    long LeadEngineerId,
    DateOnly StartDate,
    DateOnly TargetDelivery,
    string Site,
    string? Remark);

public sealed record ProjectDocumentSummary(
    long Id,
    string FileName,
    string ContentType,
    long SizeBytes,
    string FolderCode,
    string FolderName,
    string DocumentType,
    string? Remark,
    string UploadedByName,
    DateTimeOffset UploadedAt,
    string? Sha256,
    string RowVersion);

public sealed record ItemBalance(
    long ItemId,
    string ItemCode,
    string PartNumber,
    string Description,
    string Brand,
    string Unit,
    string Location,
    decimal Usable,
    decimal Quarantine,
    decimal Reserved,
    decimal Available,
    decimal OnOrder,
    decimal AverageUnitCost,
    decimal ReorderLevel);

public sealed record WorkflowRequest(string? Comment, string RowVersion);

public sealed record CostItemRequest(
    string EstimateRowVersion,
    string? LineRowVersion,
    string CategoryCode,
    string Category,
    string? Subcategory,
    string Module,
    string ItemCode,
    string Description,
    string? Brand,
    string? Model,
    string? Specification,
    long? SupplierId,
    decimal Quantity,
    string Unit,
    decimal UnitCost,
    string PriceSource,
    string? ReferenceNumber,
    string? ReferenceProject,
    DateOnly? PriceDate,
    string? Remark,
    long OwnerId);

public sealed record DeleteCostItemRequest(string EstimateRowVersion, string LineRowVersion, string? Reason);

public sealed record CreateCustomerRequest(
    string Code,
    string Name,
    string? Contact,
    string? Email,
    string? Phone,
    string? Industry,
    string? Site);

public sealed record CreateSupplierRequest(
    string Code,
    string Name,
    string Category,
    string? Contact,
    string? Email,
    string? Phone,
    IReadOnlyList<string>? Brands);

public sealed record CreateInventoryItemRequest(
    string ItemCode,
    string? PartNumber,
    string Description,
    string? Brand,
    string Unit,
    string? Location,
    decimal ReorderLevel,
    decimal AverageUnitCost,
    int LeadTimeDays,
    long? PreferredSupplierId);

public sealed record CreateEngineeringRateRequest(
    string Level,
    string Department,
    decimal EngineeringHourly,
    decimal EngineeringDaily,
    decimal InstallationHourly,
    decimal InstallationDaily,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo);

public sealed record ApiError(string Code, string Message, object? Details = null);
