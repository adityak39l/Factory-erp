import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints, downloadFile } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Alert, Badge, Button, Card, EmptyState, Loading, Stat } from '../components/ui';

/** Upload → Validate → Preview → Confirm → Import. Invalid rows are never imported. */
export default function EmployeeImport() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const downloadTemplate = async () => {
    try {
      await downloadFile('/employees/import/template', {}, 'employee-import-template.csv');
      toast.success('Template downloaded', 'Fill it in and upload it here.');
    } catch (err) {
      toast.apiError(err, 'Could not download the template');
    }
  };

  const validate = async (selected) => {
    const form = new FormData();
    form.append('file', selected);
    setValidating(true);
    setResult(null);
    try {
      const { data } = await endpoints.employees.validateImport(form);
      setPreview(data);
      toast.info(
        `${data.summary.valid} of ${data.summary.total} rows are ready`,
        data.summary.invalid ? `${data.summary.invalid} row(s) have problems and will be skipped.` : ''
      );
    } catch (err) {
      toast.apiError(err, 'Could not read that file');
      setPreview(null);
    } finally {
      setValidating(false);
    }
  };

  const onSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    validate(selected);
  };

  const confirmImport = async () => {
    const rows = preview.rows.filter((r) => r.valid).map((r) => r.data);
    setImporting(true);
    try {
      const { data } = await endpoints.employees.confirmImport(rows);
      setResult(data);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(`${data.imported} employees imported`, 'Employee IDs were generated automatically.');
    } catch (err) {
      toast.apiError(err, 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Bulk Employee Import</h1>
          <div className="page-head__subtitle">
            Bring the existing workforce in from a spreadsheet in one go
          </div>
        </div>
        <div className="page-head__actions">
          <Button onClick={downloadTemplate} icon="⬇️">
            Download template
          </Button>
          <Button onClick={() => navigate('/employees')}>← Employees</Button>
        </div>
      </div>

      <div className="grid grid--2 mb-3">
        <Card title="1 · Upload the file" subtitle="CSV or Excel (.xlsx), up to 1000 rows">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xlsm"
            onChange={onSelect}
            className="input"
            style={{ padding: 7, height: 'auto' }}
          />
          {file ? (
            <div className="text-small text-muted mt-1">
              Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </div>
          ) : null}
          <div className="mt-2">
            <Alert tone="neutral" title="Required columns">
              <span className="mono text-small">
                name, department, joiningDate
              </span>{' '}
              are required. Optional: designation, fathersName, mobileNo, email, address, team,
              employeeType, shiftCategory, requiresWorkQty, aadharNo, bankName, accountNo, ifsc.
            </Alert>
          </div>
        </Card>

        <Card title="How it works" subtitle="Nothing is written until you confirm">
          <ol style={{ paddingLeft: 18, color: 'var(--slate-600)', lineHeight: 1.9, margin: 0 }}>
            <li>Upload your CSV or Excel file.</li>
            <li>Every row is checked against the master data and the validation rules.</li>
            <li>You see exactly which rows are good and what is wrong with the rest.</li>
            <li>Confirm — only valid rows are imported, each with a generated employee ID.</li>
          </ol>
        </Card>
      </div>

      {validating ? <Loading text="Validating rows…" /> : null}

      {preview ? (
        <>
          <div className="grid grid--stats mb-2">
            <Stat label="Rows found" value={preview.summary.total} icon="📄" tone="navy" />
            <Stat label="Ready to import" value={preview.summary.valid} icon="✅" tone="green" />
            <Stat label="Will be skipped" value={preview.summary.invalid} icon="⛔" tone="red" />
            <Stat label="With warnings" value={preview.summary.warnings} icon="⚠️" tone="amber" />
          </div>

          <Card
            title="2 · Preview"
            subtitle="Rows with errors are skipped automatically"
            flush
            actions={
              <Button
                variant="primary"
                onClick={confirmImport}
                loading={importing}
                disabled={!preview.summary.valid}
              >
                Import {preview.summary.valid} employee{preview.summary.valid === 1 ? '' : 's'}
              </Button>
            }
          >
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Type</th>
                    <th>Shift</th>
                    <th>Joining</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} style={row.valid ? undefined : { background: '#fff8f8' }}>
                      <td className="mono">{row.rowNumber}</td>
                      <td className="table__strong">{row.data.name || <em>missing</em>}</td>
                      <td>{row.data.department}</td>
                      <td>{row.data.employeeType}</td>
                      <td>{row.data.shiftCategory}</td>
                      <td>{row.data.joiningDate}</td>
                      <td>
                        {row.valid ? (
                          <Badge tone="green">Ready</Badge>
                        ) : (
                          <div>
                            <Badge tone="red">Skipped</Badge>
                            <div className="text-small" style={{ color: 'var(--red-600)', marginTop: 4 }}>
                              {row.errors.join(' · ')}
                            </div>
                          </div>
                        )}
                        {row.warnings?.length ? (
                          <div className="text-small" style={{ color: 'var(--amber-600)', marginTop: 4 }}>
                            ⚠️ {row.warnings.join(' · ')}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {result ? (
        <Card title="Import complete" className="mt-2">
          <div className="grid grid--stats mb-2">
            <Stat label="Imported" value={result.imported} icon="✅" tone="green" />
            <Stat label="Skipped (invalid)" value={result.skipped} icon="⛔" tone="red" />
            <Stat label="Failed" value={result.failed?.length || 0} icon="⚠️" tone="amber" />
          </div>
          {result.created?.length ? (
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {result.created.map((c) => (
                    <tr key={c.employeeId}>
                      <td className="mono table__strong">{c.employeeId}</td>
                      <td>{c.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📭" title="Nothing was imported" />
          )}
          <Button variant="primary" className="mt-2" onClick={() => navigate('/employees')}>
            View employees
          </Button>
        </Card>
      ) : null}
    </>
  );
}
