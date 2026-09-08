import { useEffect, useState } from 'react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Stat, Badge, Button, Modal, Field, Input, Select, Loading, EmptyState } from '../components/ui';

export default function Advances() {
  const { can, isAdmin } = useAuth();
  const canManage = isAdmin || can('canManageAdvances');

  const [advances, setAdvances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Active');

  // Issue modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState({
    employee: '',
    issuedDate: new Date().toISOString().slice(0, 10),
    totalAmount: '',
    purpose: '',
    repaymentType: 'Installments',
    totalInstallments: 3,
  });

  // Cancel modal
  const [cancelModal, setCancelModal] = useState({ open: false, advance: null, reason: '' });
  const [cancelling, setCancelling] = useState(false);

  // Expanded row for repayment ledger
  const [expandedId, setExpandedId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [advRes, empRes] = await Promise.all([
        endpoints.advances.list({ status: statusFilter === 'All' ? undefined : statusFilter }),
        endpoints.employees.list({ status: 'Active', limit: 200 }),
      ]);
      setAdvances(advRes.data.advances || []);
      setEmployees(empRes.data.employees || []);
    } catch (err) {
      console.error('Failed to load advances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee || !form.totalAmount) return;
    setIssuing(true);
    try {
      await endpoints.advances.create({
        employee: form.employee,
        issuedDate: form.issuedDate,
        totalAmount: Number(form.totalAmount),
        purpose: form.purpose,
        repaymentType: form.repaymentType,
        totalInstallments: form.repaymentType === 'FullNextMonth' ? 1 : Number(form.totalInstallments),
      });
      setIssueModalOpen(false);
      setForm({
        employee: '',
        issuedDate: new Date().toISOString().slice(0, 10),
        totalAmount: '',
        purpose: '',
        repaymentType: 'Installments',
        totalInstallments: 3,
      });
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to issue advance');
    } finally {
      setIssuing(false);
    }
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!cancelModal.advance) return;
    setCancelling(true);
    try {
      await endpoints.advances.cancel(cancelModal.advance._id, { cancelReason: cancelModal.reason });
      setCancelModal({ open: false, advance: null, reason: '' });
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to cancel advance');
    } finally {
      setCancelling(false);
    }
  };

  // Live EMI calculation
  const calculatedEmi = (() => {
    const amt = Number(form.totalAmount) || 0;
    const inst = form.repaymentType === 'FullNextMonth' ? 1 : Math.max(1, Number(form.totalInstallments) || 1);
    return Math.ceil(amt / inst);
  })();

  // Aggregates
  const totalDisbursed = advances.reduce((s, a) => s + (a.totalAmount || 0), 0);
  const totalOutstanding = advances.reduce((s, a) => s + (a.remainingBalance || 0), 0);
  const totalRecovered = totalDisbursed - totalOutstanding;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 24 }}>💵</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Salary Advances Ledger</h2>
              <div className="text-small text-muted">Issue loans, track monthly installments, and monitor recovery progress</div>
            </div>
          </div>

          {canManage && (
            <Button variant="primary" onClick={() => setIssueModalOpen(true)} icon="➕">
              Issue New Advance
            </Button>
          )}
        </div>
      </Card>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Stat
          label="Total Advances"
          value={advances.length}
          hint={`${statusFilter} category`}
          tone="navy"
          icon="📋"
        />
        <Stat
          label="Total Disbursed"
          value={`₹${totalDisbursed.toLocaleString('en-IN')}`}
          hint="Principle issued"
          tone="blue"
          icon="📤"
        />
        <Stat
          label="Recovered So Far"
          value={`₹${totalRecovered.toLocaleString('en-IN')}`}
          hint="Deducted via payroll"
          tone="green"
          icon="📥"
        />
        <Stat
          label="Outstanding Balance"
          value={`₹${totalOutstanding.toLocaleString('en-IN')}`}
          hint="To be recovered"
          tone="amber"
          icon="⏳"
        />
      </div>

      {/* Table Card */}
      <Card
        title="Advance Records"
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            {['Active', 'Completed', 'Cancelled', 'All'].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'primary' : 'default'}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        }
        flush
      >
        {loading && <Loading text="Loading advances..." />}

        {!loading && advances.length === 0 && (
          <EmptyState
            icon="💵"
            title={`No ${statusFilter !== 'All' ? statusFilter : ''} Advances Found`}
            text="No salary advances have been recorded matching this filter."
          />
        )}

        {!loading && advances.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Issued Date</th>
                  <th>Purpose</th>
                  <th style={{ textAlign: 'right' }}>Total Loan (₹)</th>
                  <th style={{ textAlign: 'right' }}>Monthly EMI (₹)</th>
                  <th style={{ textAlign: 'right' }}>Remaining (₹)</th>
                  <th style={{ textAlign: 'center' }}>Progress</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((adv) => {
                  const emp = adv.employee;
                  const percent = Math.min(
                    100,
                    Math.round(((adv.totalAmount - adv.remainingBalance) / adv.totalAmount) * 100)
                  );
                  const isExpanded = expandedId === adv._id;

                  const statusTone = {
                    Active: 'green',
                    Completed: 'blue',
                    Cancelled: 'slate',
                  }[adv.status] || 'slate';

                  return (
                    <>
                      <tr key={adv._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{emp?.name || '—'}</div>
                          <div className="text-small text-muted">
                            {emp?.employeeId} • {emp?.department?.name || 'General'}
                          </div>
                        </td>
                        <td>{new Date(adv.issuedDate).toLocaleDateString('en-IN')}</td>
                        <td>{adv.purpose || <span className="text-muted">Personal</span>}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ₹{adv.totalAmount.toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'right', color: '#D97706', fontWeight: 600 }}>
                          ₹{adv.installmentAmount.toLocaleString('en-IN')} /mo
                          <div className="text-small text-muted">{adv.totalInstallments} installments</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: adv.remainingBalance > 0 ? '#DC2626' : '#166534' }}>
                          ₹{adv.remainingBalance.toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'center', width: 110 }}>
                          <div style={{ width: '100%', background: '#E2E8F0', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${percent}%`, background: percent === 100 ? '#166534' : '#E28431', height: '100%' }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{percent}% repaid</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Badge tone={statusTone} dot>
                            {adv.status}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => setExpandedId(isExpanded ? null : adv._id)}
                            >
                              {isExpanded ? 'Hide' : 'History'}
                            </Button>
                            {canManage && adv.status === 'Active' && (
                              <Button
                                size="sm"
                                variant="default"
                                style={{ color: '#DC2626' }}
                                onClick={() => setCancelModal({ open: true, advance: adv, reason: '' })}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Repayment History Expansion */}
                      {isExpanded && (
                        <tr key={`${adv._id}-expanded`} style={{ background: 'var(--slate-050)' }}>
                          <td colSpan={9} style={{ padding: '16px 24px' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>
                              Repayment Ledger & Deductions for {emp?.name}
                            </h4>
                            {(!adv.repayments || adv.repayments.length === 0) ? (
                              <div className="text-small text-muted">
                                No installments have been deducted yet. Deductions happen automatically when Monthly Payroll is approved.
                              </div>
                            ) : (
                              <table className="table" style={{ background: '#FFF', maxWidth: 650 }}>
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Payroll Month</th>
                                    <th style={{ textAlign: 'right' }}>Amount Deducted (₹)</th>
                                    <th>Deducted On</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {adv.repayments.map((rep, idx) => (
                                    <tr key={rep._id || idx}>
                                      <td>{idx + 1}</td>
                                      <td>{rep.month}/{rep.year}</td>
                                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }}>
                                        ₹{rep.amountDeducted.toLocaleString('en-IN')}
                                      </td>
                                      <td>{new Date(rep.deductedAt).toLocaleString('en-IN')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Issue Advance Modal */}
      <Modal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        title="Issue New Salary Advance"
        subtitle="Specify loan amount and repayment tenure. Monthly deductions will calculate automatically."
      >
        <form onSubmit={handleIssueSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Select Employee" required>
            <Select
              value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}
              required
            >
              <option value="">-- Choose Employee --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.employeeId}) • {e.department?.name || 'General'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Issue Date" required>
            <Input
              type="date"
              value={form.issuedDate}
              onChange={(e) => setForm({ ...form, issuedDate: e.target.value })}
              required
            />
          </Field>

          <Field label="Advance Amount (₹)" required>
            <Input
              type="number"
              min="100"
              placeholder="e.g. 10000"
              value={form.totalAmount}
              onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
              required
            />
          </Field>

          <Field label="Repayment Type" required>
            <Select
              value={form.repaymentType}
              onChange={(e) => setForm({ ...form, repaymentType: e.target.value })}
            >
              <option value="Installments">Multi-Month Installments (EMI)</option>
              <option value="FullNextMonth">Full Recovery in Next Payroll</option>
            </Select>
          </Field>

          {form.repaymentType === 'Installments' && (
            <Field label="Number of Monthly Installments" required>
              <Input
                type="number"
                min="2"
                max="24"
                value={form.totalInstallments}
                onChange={(e) => setForm({ ...form, totalInstallments: e.target.value })}
                required
              />
            </Field>
          )}

          {/* Live EMI preview card */}
          {Number(form.totalAmount) > 0 && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                Live EMI Calculation Preview
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 13 }}>Monthly Payroll Deduction:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>
                  ₹{calculatedEmi.toLocaleString('en-IN')} / month
                </span>
              </div>
              <div className="text-small text-muted" style={{ marginTop: 2 }}>
                {form.repaymentType === 'FullNextMonth'
                  ? 'Will be deducted in 1 payment next month'
                  : `Deducted across ${form.totalInstallments} monthly payrolls`}
              </div>
            </div>
          )}

          <Field label="Purpose / Reason (Optional)">
            <Input
              placeholder="e.g. Festival advance, Medical assistance"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </Field>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="default" onClick={() => setIssueModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={issuing}>
              Issue Advance
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal.open}
        onClose={() => setCancelModal({ open: false, advance: null, reason: '' })}
        title="Cancel Salary Advance"
        subtitle={`Remaining balance of ₹${cancelModal.advance?.remainingBalance?.toLocaleString('en-IN')} will not be deducted.`}
      >
        <form onSubmit={handleCancelSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Cancellation Reason" required>
            <Input
              placeholder="e.g. Paid in cash directly, Waived by management"
              value={cancelModal.reason}
              onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
              required
            />
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="default" onClick={() => setCancelModal({ open: false, advance: null, reason: '' })}>
              Back
            </Button>
            <Button type="submit" variant="primary" style={{ background: '#DC2626' }} loading={cancelling}>
              Confirm Cancellation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
