<?php
/**
 * PHP backend viability spike.
 *
 * Before rewriting 135 routes, prove PHP can reproduce the six database
 * behaviours the C# API depends on for correctness. If any of these cannot be
 * done cleanly from PHP, the rewrite is in trouble and it is far cheaper to
 * know that now than in week six.
 *
 * Read-only apart from work inside transactions that are always rolled back.
 *
 * Run:  php backend-php/spike/viability.php
 */

declare(strict_types=1);

$database = getenv('IOT_DB') ?: 'IoTTeamCenter_CodexTest_20260830_04';
$server   = getenv('IOT_SQL_SERVER') ?: 'localhost';

$pass = 0;
$fail = 0;

function check(string $label, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    $ok ? $pass++ : $fail++;
    printf("%-46s %s%s\n", $label, $ok ? 'PASS' : '*** FAIL ***', $detail !== '' ? "  ($detail)" : '');
}

echo "PHP " . PHP_VERSION . " · pdo_sqlsrv " . (extension_loaded('pdo_sqlsrv') ? 'loaded' : 'MISSING') . "\n";
echo "Target: {$server} / {$database}\n\n";

// ---------------------------------------------------------------------------
// T1 · Connect with Windows authentication, as the C# API does in development.
// ---------------------------------------------------------------------------
try {
    $pdo = new PDO(
        "sqlsrv:Server={$server};Database={$database};TrustServerCertificate=1",
        null,
        null,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
    check('T1 connect (Windows auth)', true);
} catch (Throwable $e) {
    check('T1 connect (Windows auth)', false, $e->getMessage());
    exit(1);
}

// QUOTED_IDENTIFIER must be ON or any write touching the filtered unique index
// on knowledge_document_versions fails with msg 1934. The driver sets it, but
// prove it rather than assume it.
$qi = $pdo->query('SELECT SESSIONPROPERTY(\'QUOTED_IDENTIFIER\') AS qi')->fetch();
check('T1b QUOTED_IDENTIFIER is ON', (int) $qi['qi'] === 1, 'required by the filtered index');

// ---------------------------------------------------------------------------
// T2 · Read the schema the API serves.
// ---------------------------------------------------------------------------
try {
    $row = $pdo->query(
        'SELECT COUNT(*) AS n FROM dbo.knowledge_documents WHERE archived_at IS NULL'
    )->fetch();
    $version = $pdo->query('SELECT MAX(version) AS v FROM dbo.schema_versions')->fetch();
    check('T2 read knowledge tables', true, "{$row['n']} documents, schema v{$version['v']}");
} catch (Throwable $e) {
    check('T2 read knowledge tables', false, $e->getMessage());
}

// ---------------------------------------------------------------------------
// T3 · Stored procedure with an OUTPUT parameter.
// The document number allocator is a procedure; PHP must be able to read the
// value back, not just execute it.
// ---------------------------------------------------------------------------
try {
    $pdo->beginTransaction();
    $number = str_repeat(' ', 40);
    $stmt = $pdo->prepare('{CALL dbo.issue_knowledge_document_number(?, ?, ?)}');
    $stmt->bindValue(1, 'STD');
    $stmt->bindValue(2, 'EE');
    $stmt->bindParam(3, $number, PDO::PARAM_STR | PDO::PARAM_INPUT_OUTPUT, 40);
    $stmt->execute();
    $stmt->closeCursor();
    $pdo->rollBack();
    check('T3 stored proc OUTPUT parameter', preg_match('/^STD-EE-\d{4}$/', trim($number)) === 1, trim($number));
} catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    check('T3 stored proc OUTPUT parameter', false, $e->getMessage());
}

// ---------------------------------------------------------------------------
// T4 · Serializable transaction with UPDLOCK/HOLDLOCK.
// This is the publish path: take the lock, read the current published
// revision, and be certain no one else can slip in behind you.
// ---------------------------------------------------------------------------
try {
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'SELECT id FROM dbo.knowledge_document_versions WITH (UPDLOCK, HOLDLOCK)
          WHERE document_id = ? AND status = N\'Published\''
    );
    $stmt->execute([1]);
    $locked = $stmt->fetchColumn();
    $pdo->rollBack();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    check('T4 SERIALIZABLE + UPDLOCK/HOLDLOCK', true, $locked === false ? 'no published row' : "locked version {$locked}");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    check('T4 SERIALIZABLE + UPDLOCK/HOLDLOCK', false, $e->getMessage());
}

// ---------------------------------------------------------------------------
// T5 · rowversion optimistic concurrency.
// 183 places in the C# API guard a write with "WHERE row_version = @rv".
// PHP must be able to round-trip a binary(8) rowversion faithfully.
// ---------------------------------------------------------------------------
try {
    $row = $pdo->query('SELECT TOP 1 id, row_version FROM dbo.knowledge_documents ORDER BY id')->fetch();
    if ($row === false) {
        check('T5 rowversion round-trip', false, 'no rows to test against');
    } else {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM dbo.knowledge_documents WHERE id = ? AND row_version = CONVERT(binary(8), ?)'
        );
        $stmt->bindValue(1, $row['id'], PDO::PARAM_INT);
        $stmt->bindValue(2, $row['row_version'], PDO::PARAM_LOB);
        $stmt->execute();
        $matched = (int) $stmt->fetchColumn();

        // And a stale token must NOT match, or the guard is decorative.
        $stale = "\x00\x00\x00\x00\x00\x00\x00\x01";
        $stmt->bindValue(2, $stale, PDO::PARAM_LOB);
        $stmt->execute();
        $staleMatched = (int) $stmt->fetchColumn();

        check('T5 rowversion round-trip', $matched === 1 && $staleMatched === 0,
            "current matches={$matched}, stale matches={$staleMatched}");
    }
} catch (Throwable $e) {
    check('T5 rowversion round-trip', false, $e->getMessage());
}

// ---------------------------------------------------------------------------
// T6 · The database guards still bite from PHP.
// Audit rows are append-only by trigger. A PHP client must be refused exactly
// as the C# one is — the protection lives in SQL Server, not in the language.
// ---------------------------------------------------------------------------
try {
    $pdo->beginTransaction();
    $refused = false;
    try {
        $pdo->exec("UPDATE dbo.knowledge_audit_events SET reason = N'tampered' WHERE id = (SELECT MIN(id) FROM dbo.knowledge_audit_events)");
    } catch (Throwable $inner) {
        $refused = str_contains($inner->getMessage(), 'append-only');
    }
    $pdo->rollBack();
    check('T6 append-only trigger refuses PHP too', $refused, 'THROW 51172 surfaced as an exception');
} catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    check('T6 append-only trigger refuses PHP too', false, $e->getMessage());
}

// ---------------------------------------------------------------------------
// T7 · Rollback actually rolls back.
// ---------------------------------------------------------------------------
try {
    $before = (int) $pdo->query('SELECT COUNT(*) FROM dbo.knowledge_number_sequences')->fetchColumn();
    $pdo->beginTransaction();
    $pdo->exec("INSERT INTO dbo.knowledge_number_sequences(prefix, scope_code, scope_name) VALUES (N'ZZZ', N'SPIKE', N'rollback probe')");
    $pdo->rollBack();
    $after = (int) $pdo->query('SELECT COUNT(*) FROM dbo.knowledge_number_sequences')->fetchColumn();
    check('T7 rollback leaves no trace', $before === $after, "{$before} -> {$after}");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    check('T7 rollback leaves no trace', false, $e->getMessage());
}

// ---------------------------------------------------------------------------
// T8 · Unicode round-trip. Category names carry Thai and Japanese; a driver
// that mangles them would corrupt the multilingual master data silently.
// ---------------------------------------------------------------------------
try {
    $stmt = $pdo->prepare('SELECT name_en, name_th, name_ja FROM dbo.knowledge_categories WHERE code = ?');
    $stmt->execute(['STANDARDS']);
    $row = $stmt->fetch();
    $ok = $row !== false
        && str_contains($row['name_th'], 'มาตรฐาน')
        && str_contains($row['name_ja'], '標準');
    check('T8 Thai + Japanese round-trip', $ok, $row === false ? 'category missing' : "{$row['name_th']} / {$row['name_ja']}");
} catch (Throwable $e) {
    check('T8 Thai + Japanese round-trip', false, $e->getMessage());
}

echo "\n";
printf("%d passed, %d failed\n", $pass, $fail);
exit($fail === 0 ? 0 : 1);
