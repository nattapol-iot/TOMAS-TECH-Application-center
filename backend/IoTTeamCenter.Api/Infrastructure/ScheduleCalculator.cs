namespace IoTTeamCenter.Api.Infrastructure;

public sealed record ScheduleCalculationTask(
    long Id,
    long? ParentId,
    int SortOrder,
    DateOnly? PlanStart,
    int PlanDays,
    string StartMode,
    long? PredecessorId,
    int LagDays,
    DateOnly? ActualStart,
    DateOnly? ActualFinish,
    DateOnly? ForecastFinish,
    decimal PercentComplete,
    string Status);

public sealed class ResolvedScheduleTask
{
    public required ScheduleCalculationTask Source { get; init; }
    public required string Wbs { get; set; }
    public required int Depth { get; set; }
    public DateOnly? PlanStart { get; init; }
    public DateOnly? PlanFinish { get; init; }
    public DateOnly? ActualStart { get; init; }
    public DateOnly? ActualFinish { get; init; }
    public DateOnly? ForecastFinish { get; init; }
    public required int WorkDays { get; init; }
    public required int Weight { get; init; }
    public required decimal PercentComplete { get; init; }
    public required string Status { get; init; }
    public required IReadOnlyList<ResolvedScheduleTask> Children { get; init; }
}

public sealed record ResolvedSchedule(
    IReadOnlyList<ResolvedScheduleTask> Roots,
    IReadOnlyDictionary<long, ResolvedScheduleTask> ById);

/// <summary>
/// Resolves linked dates and WBS roll-ups from immutable database facts. No
/// derived parent value is accepted from a client or persisted during normal
/// schedule edits.
/// </summary>
public static class ScheduleCalculator
{
    public static ResolvedSchedule Resolve(
        IReadOnlyCollection<ScheduleCalculationTask> tasks,
        IReadOnlySet<DateOnly> holidays)
    {
        var byId = tasks.ToDictionary(task => task.Id);
        var children = tasks
            .GroupBy(task => task.ParentId ?? 0)
            .ToDictionary(
                group => group.Key,
                group => group.OrderBy(task => task.SortOrder).ThenBy(task => task.Id).ToArray());
        var resolved = new Dictionary<long, ResolvedScheduleTask>();
        var visiting = new HashSet<long>();

        ResolvedScheduleTask ResolveOne(ScheduleCalculationTask task)
        {
            if (resolved.TryGetValue(task.Id, out var cached)) return cached;
            if (!visiting.Add(task.Id))
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_cycle", "The schedule contains a circular parent or predecessor relationship.");

            var resolvedChildren = children.GetValueOrDefault(task.Id, [])
                .Select(ResolveOne)
                .ToArray();

            ResolvedScheduleTask result;
            if (resolvedChildren.Length > 0)
            {
                var planStart = Minimum(resolvedChildren.Select(child => child.PlanStart));
                var planFinish = Maximum(resolvedChildren.Select(child => child.PlanFinish));
                var actualStart = Minimum(resolvedChildren.Select(child => child.ActualStart));
                var actualFinish = resolvedChildren.All(child => child.Status == "Done")
                    ? Maximum(resolvedChildren.Select(child => child.ActualFinish))
                    : null;
                var forecastFinish = Maximum(resolvedChildren.Select(child => child.ForecastFinish ?? child.PlanFinish));
                var weight = resolvedChildren.Sum(child => child.Weight);
                var weightedProgress = weight == 0
                    ? 0
                    : resolvedChildren.Sum(child => child.PercentComplete * child.Weight) / weight;
                var status = resolvedChildren.All(child => child.Status == "Done")
                    ? "Done"
                    : resolvedChildren.Any(child => child.Status == "Blocked")
                        ? "Blocked"
                        : resolvedChildren.Any(child => child.Status != "Not Started" || child.PercentComplete > 0 || child.ActualStart is not null)
                            ? "In Progress"
                            : "Not Started";

                result = new ResolvedScheduleTask
                {
                    Source = task,
                    Wbs = string.Empty,
                    Depth = 0,
                    PlanStart = planStart,
                    PlanFinish = planFinish,
                    ActualStart = actualStart,
                    ActualFinish = actualFinish,
                    ForecastFinish = forecastFinish,
                    WorkDays = NetworkDays(planStart, planFinish, holidays),
                    Weight = Math.Max(1, weight),
                    PercentComplete = decimal.Round(weightedProgress, 2, MidpointRounding.AwayFromZero),
                    Status = status,
                    Children = resolvedChildren
                };
            }
            else
            {
                var planStart = task.PlanStart;
                if (task.StartMode == "linked" && task.PredecessorId is long predecessorId)
                {
                    if (!byId.TryGetValue(predecessorId, out var predecessor))
                        throw new ApiException(StatusCodes.Status409Conflict, "schedule_predecessor_missing", "A linked task refers to an inactive predecessor.");
                    var predecessorFinish = ResolveOne(predecessor).PlanFinish;
                    if (predecessorFinish is not null)
                        planStart = NextWorkDay(SafeAddDays(predecessorFinish.Value, 1 + task.LagDays), holidays);
                }

                DateOnly? planFinish = planStart is null
                    ? null
                    : SafeAddDays(planStart.Value, Math.Max(1, task.PlanDays) - 1);
                var workDays = NetworkDays(planStart, planFinish, holidays);
                result = new ResolvedScheduleTask
                {
                    Source = task,
                    Wbs = string.Empty,
                    Depth = 0,
                    PlanStart = planStart,
                    PlanFinish = planFinish,
                    ActualStart = task.ActualStart,
                    ActualFinish = task.ActualFinish,
                    ForecastFinish = task.ForecastFinish,
                    WorkDays = workDays,
                    Weight = Math.Max(1, workDays),
                    PercentComplete = task.PercentComplete,
                    Status = task.Status,
                    Children = []
                };
            }

            visiting.Remove(task.Id);
            resolved.Add(task.Id, result);
            return result;
        }

        var roots = children.GetValueOrDefault(0, []).Select(ResolveOne).ToArray();
        foreach (var task in tasks) ResolveOne(task);

        void Number(IReadOnlyList<ResolvedScheduleTask> siblings, string prefix, int depth)
        {
            for (var index = 0; index < siblings.Count; index++)
            {
                var item = siblings[index];
                item.Wbs = string.IsNullOrEmpty(prefix) ? $"{index + 1}" : $"{prefix}.{index + 1}";
                item.Depth = depth;
                Number(item.Children, item.Wbs, depth + 1);
            }
        }

        Number(roots, string.Empty, 0);
        return new ResolvedSchedule(roots, resolved);
    }

    public static int NetworkDays(DateOnly? start, DateOnly? finish, IReadOnlySet<DateOnly> holidays)
    {
        if (start is null || finish is null || finish < start) return 0;
        var count = 0;
        for (var day = start.Value; ; day = SafeAddDays(day, 1))
        {
            if (IsWorkDay(day, holidays)) count++;
            if (day == finish.Value) break;
        }
        return count;
    }

    private static DateOnly NextWorkDay(DateOnly date, IReadOnlySet<DateOnly> holidays)
    {
        var candidate = date;
        while (!IsWorkDay(candidate, holidays)) candidate = SafeAddDays(candidate, 1);
        return candidate;
    }

    private static DateOnly SafeAddDays(DateOnly date, int days)
    {
        try
        {
            return date.AddDays(days);
        }
        catch (ArgumentOutOfRangeException)
        {
            throw new ApiException(StatusCodes.Status422UnprocessableEntity, "schedule_date_out_of_range", "The schedule dates and duration exceed the supported date range.");
        }
    }

    private static bool IsWorkDay(DateOnly date, IReadOnlySet<DateOnly> holidays) =>
        date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday) && !holidays.Contains(date);

    private static DateOnly? Minimum(IEnumerable<DateOnly?> values) =>
        values.Where(value => value is not null).Select(value => value!.Value).Cast<DateOnly?>().Min();

    private static DateOnly? Maximum(IEnumerable<DateOnly?> values) =>
        values.Where(value => value is not null).Select(value => value!.Value).Cast<DateOnly?>().Max();
}
