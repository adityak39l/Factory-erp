import { useEffect, useState } from 'react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Stat, Badge, Button, Modal, Field, Input, Select, Loading, EmptyState } from '../components/ui';

export default function Payroll() {
  const { can, isAdmin } = useAuth();
  const canManage = isAdmin || can('canManagePayroll');
  const canView = isAdmin || can('canViewSalary') || can('canManagePayroll');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [workingDays, setWorkingDays] = useState(26);

  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [payroll, setPayroll] = useState(null);
  const [payrollsList, setPayrollsList] = useState([]);
  const [showDeptSummary, setShowDeptSummary] = useState(false);
  const [registeredEmployees, setRegisteredEmployees] = useState([]);

  // Adjustment modal state
  const [adjModal, setAdjModal] = useState({ open: false, emp: null, label: '', amount: '', type: 'Addition' });
  const [savingAdj, setSavingAdj] = useState(false);

  // Manual Overtime modal state
  const [otModal, setOtModal] = useState({ open: false, record: null, hours: '' });
  const [savingOt, setSavingOt] = useState(false);

  // Hover popover for Grand Total
  const [activePopover, setActivePopover] = useState(null);

  const loadPayrollsList = async () => {
    try {
      const res = await endpoints.payroll.list();
      setPayrollsList(res.data.payrolls || []);
    } catch (err) {
      console.error('Failed to list payrolls:', err);
    }
  };

  const loadPayrollDetail = async (id) => {
    setLoading(true);
    try {
      const res = await endpoints.payroll.get(id);
      setPayroll(res.data.payroll);
      if (res.data.payroll.workingDaysInMonth) {
        setWorkingDays(res.data.payroll.workingDaysInMonth);
      }
    } catch (err) {
      console.error('Failed to load payroll details:', err);
      setPayroll(null);
    } finally {
      setLoading(false);
    }
  };

  const loadRegisteredStaff = async () => {
    try {
      const res = await endpoints.employees.list({ status: 'Active', limit: 100 });
      setRegisteredEmployees(res.data.employees || []);
    } catch {
      setRegisteredEmployees([]);
    }
  };

  useEffect(() => {
    loadPayrollsList();
    loadRegisteredStaff();
  }, []);

  useEffect(() => {
    const match = payrollsList.find((p) => p.month === selectedMonth && p.year === selectedYear);
    if (match) {
      loadPayrollDetail(match.id);
    } else {
      setPayroll(null);
      loadRegisteredStaff();
    }
  }, [selectedMonth, selectedYear, payrollsList]);

  const handleCalculate = async () => {
    if (!canManage) return;
    setCalculating(true);
    try {
      const res = await endpoints.payroll.calculate({
        month: Number(selectedMonth),
        year: Number(selectedYear),
        workingDaysInMonth: Number(workingDays) || 26,
      });
      await loadPayrollsList();
      if (res.data.payroll?._id) {
        await loadPayrollDetail(res.data.payroll._id);
      }
    } catch (err) {
      alert(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const handleSyncEmployees = async () => {
    if (!payroll?._id || !canManage) return;
    setSyncing(true);
    try {
      await endpoints.payroll.syncEmployees(payroll._id);
      await loadPayrollDetail(payroll._id);
      alert('All active candidates have been synced into this month’s salary roll.');
    } catch (err) {
      alert(err.message || 'Failed to sync employees');
    } finally {
      setSyncing(false);
    }
  };

  const handleApprove = async () => {
    if (!payroll?._id || !canManage) return;
    if (!window.confirm('Are you sure you want to approve this payroll? Advance installments will be deducted from active balances.')) return;
    try {
      await endpoints.payroll.approve(payroll._id);
      await loadPayrollDetail(payroll._id);
      await loadPayrollsList();
    } catch (err) {
      alert(err.message || 'Approval failed');
    }
  };

  const handleMarkPaid = async () => {
    if (!payroll?._id || !canManage) return;
    if (!window.confirm('Mark this payroll as PAID? This will PERMANENTLY LOCK the records against any future changes.')) return;
    try {
      await endpoints.payroll.markPaid(payroll._id);
      await loadPayrollDetail(payroll._id);
      await loadPayrollsList();
    } catch (err) {
      alert(err.message || 'Mark as Paid failed');
    }
  };

  const handleAddAdjustment = async (e) => {
    e.preventDefault();
    if (!adjModal.emp || !payroll?._id) return;
    setSavingAdj(true);
    try {
      await endpoints.payroll.addAdjustment(payroll._id, adjModal.emp.employee, {
        label: adjModal.label,
        amount: Number(adjModal.amount),
        type: adjModal.type,
      });
      setAdjModal({ open: false, emp: null, label: '', amount: '', type: 'Addition' });
      await loadPayrollDetail(payroll._id);
    } catch (err) {
      alert(err.message || 'Failed to add adjustment');
    } finally {
      setSavingAdj(false);
    }
  };

  const handleRemoveAdjustment = async (empId, adjId) => {
    if (!payroll?._id || !canManage) return;
    if (!window.confirm('Remove this adjustment?')) return;
    try {
      await endpoints.payroll.removeAdjustment(payroll._id, empId, adjId);
      await loadPayrollDetail(payroll._id);
    } catch (err) {
      alert(err.message || 'Failed to remove adjustment');
    }
  };

  const handleSaveOvertime = async (e) => {
    e.preventDefault();
    if (!otModal.record || !payroll?._id) return;
    setSavingOt(true);
    try {
      const empId = otModal.record.employee || otModal.record._id;
      await endpoints.payroll.updateOvertime(payroll._id, empId, {
        overtimeHours: Number(otModal.hours) || 0,
      });
      await loadPayrollDetail(payroll._id);
      setOtModal({ open: false, record: null, hours: '' });
    } catch (err) {
      alert(err.message || 'Failed to update overtime');
    } finally {
      setSavingOt(false);
    }
  };

  const statusTone = {
    Draft: 'amber',
    Calculated: 'blue',
    Approved: 'orange',
    Paid: 'green',
  }[payroll?.status || 'Draft'] || 'slate';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header & Controls */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 24 }}>🏦</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Monthly Payroll Dashboard</h2>
              <div className="text-small text-muted">DPR-integrated salary calculation, manual OT override, advance recoveries and payslips</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <Select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} style={{ width: 120 }}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i).toLocaleString('en-US', { month: 'long' })}
                </option>
              ))}
            </Select>

            <Select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} style={{ width: 100 }}>
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="text-small text-muted">Days in Month:</span>
              <Input
                type="number"
                min="1"
                max="31"
                value={workingDays}
                onChange={(e) => setWorkingDays(Number(e.target.value))}
                style={{ width: 65, textAlign: 'center' }}
                disabled={!canManage || payroll?.status === 'Approved' || payroll?.status === 'Paid'}
              />
            </div>

            {canManage && (!payroll || payroll.status === 'Draft' || payroll.status === 'Calculated') && (
              <Button variant="primary" onClick={handleCalculate} loading={calculating} icon="⚡">
                {payroll ? 'Recalculate from DPR' : 'Calculate from DPR'}
              </Button>
            )}

            {payroll && canManage && (payroll.status === 'Draft' || payroll.status === 'Calculated') && (
              <Button variant="default" onClick={handleSyncEmployees} loading={syncing} icon="🔄" title="Sync all newly registered candidates into this salary sheet">
                Sync Candidates
              </Button>
            )}

            {payroll && (
              <Badge tone={statusTone} dot>
                {payroll.status}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Loading state */}
      {loading && <Loading text="Loading payroll records..." />}

      {/* If No Payroll calculated yet -> Show Preview Table of Registered Candidates */}
      {!loading && !payroll && (
        <Card
          title={`Registered Candidates for ${new Date(2000, selectedMonth - 1).toLocaleString('en-US', { month: 'long' })} ${selectedYear} (${registeredEmployees.length} Staff)`}
          subtitle="All active candidates registered in the system are listed below with their configured salary structure."
          actions={
            canManage && (
              <Button variant="primary" onClick={handleCalculate} loading={calculating} icon="⚡">
                Generate This Month's Salary Roll
              </Button>
            )
          }
        >
          {registeredEmployees.length === 0 ? (
            <EmptyState
              icon="👷"
              title="No Active Employees Found"
              text="No active employees are registered yet. Go to Employees section to register staff."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Emp ID</th>
                    <th>Candidate Name</th>
                    <th>Department</th>
                    <th>Salary Type</th>
                    <th style={{ textAlign: 'right' }}>Base Salary Rate (₹)</th>
                    <th style={{ textAlign: 'center' }}>OT Multiplier</th>
                    <th style={{ textAlign: 'center' }}>Payment Mode</th>
                    <th>Joined Date</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredEmployees.map((e) => (
                    <tr key={e.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>{e.employeeId}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.name}</div>
                        {e.designation && <div className="text-small text-muted">{e.designation}</div>}
                      </td>
                      <td>{e.department?.name || '—'}</td>
                      <td>
                        <Badge tone={e.salaryConfig?.salaryType === 'Monthly' ? 'navy' : 'violet'}>
                          {e.salaryConfig?.salaryType || 'Monthly'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                        {e.salaryConfig?.baseRate !== null && e.salaryConfig?.baseRate !== undefined
                          ? `₹${Number(e.salaryConfig.baseRate).toLocaleString('en-IN')}`
                          : '₹ —'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: '#EEF2F6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                          {e.salaryConfig?.otMultiplier || '1.5x'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{e.salaryConfig?.paymentMode || 'Cash'}</td>
                      <td>{e.joiningDate ? String(e.joiningDate).slice(0, 10) : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge tone="green" dot>Active</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 16, background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-small text-muted">
                  Ready to calculate monthly earnings, attendance, DPR work hours, overtime, and advances.
                </span>
                {canManage && (
                  <Button variant="primary" onClick={handleCalculate} loading={calculating} icon="⚡">
                    Calculate from DPR Now
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Summary KPI Cards */}
      {!loading && payroll && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Stat
              label="Basic Earned"
              value={`₹${(payroll.totalBasicEarned || 0).toLocaleString('en-IN')}`}
              hint={`${payroll.records?.length || 0} employees`}
              tone="navy"
              icon="💼"
            />
            <Stat
              label="Overtime Pay (+)"
              value={`₹${(payroll.totalOvertimePay || 0).toLocaleString('en-IN')}`}
              hint="DPR & Manual OT"
              tone="green"
              icon="⏱️"
            />
            <Stat
              label="Short-Time Cut (−)"
              value={`₹${(payroll.totalShortTimeDeduction || 0).toLocaleString('en-IN')}`}
              hint="Early exit cuts"
              tone="red"
              icon="⏳"
            />
            <Stat
              label="Advance Recovery (−)"
              value={`₹${(payroll.totalAdvanceDeducted || 0).toLocaleString('en-IN')}`}
              hint={`${payroll.summary?.activeAdvances || 0} active loans`}
              tone="amber"
              icon="💵"
            />
            <Stat
              label="Adjustments (+/−)"
              value={`₹${((payroll.totalManualAdditions || 0) - (payroll.totalManualDeductions || 0)).toLocaleString('en-IN')}`}
              hint="Bonuses / Penalties"
              tone="violet"
              icon="⚖️"
            />
            <Stat
              label="COMPANY GRAND TOTAL"
              value={`₹${(payroll.companyGrandTotal || 0).toLocaleString('en-IN')}`}
              hint="Total Net Disbursement"
              tone="green"
              icon="💰"
            />
          </div>

          {/* Department Breakdown Toggle */}
          <Card flush>
            <div
              style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--slate-050)' }}
              onClick={() => setShowDeptSummary(!showDeptSummary)}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {showDeptSummary ? '▼' : '▶'} Department-Wise Salary Breakdown ({payroll.summary?.byDepartment?.length || 0} departments)
              </span>
              <span className="text-small text-muted">Click to {showDeptSummary ? 'collapse' : 'expand'}</span>
            </div>

            {showDeptSummary && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th style={{ textAlign: 'center' }}>Staff Count</th>
                      <th style={{ textAlign: 'right' }}>Basic Total (₹)</th>
                      <th style={{ textAlign: 'right' }}>OT Pay (₹)</th>
                      <th style={{ textAlign: 'right' }}>Short-Time Cut (₹)</th>
                      <th style={{ textAlign: 'right' }}>Advance Recovery (₹)</th>
                      <th style={{ textAlign: 'right', fontWeight: 700 }}>Dept Grand Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payroll.summary?.byDepartment || []).map((d) => (
                      <tr key={d.department}>
                        <td style={{ fontWeight: 600 }}>{d.department}</td>
                        <td style={{ textAlign: 'center' }}>{d.employeeCount}</td>
                        <td style={{ textAlign: 'right' }}>{d.totalBasic.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right' }}>{d.totalOT.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', color: '#DC2626' }}>−{d.totalShortTimeCut.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', color: '#D97706' }}>−{d.totalAdvanceCut.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534' }}>₹{d.grandTotal.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Master Employee Table with Sticky Grand Total */}
          <Card
            title={`Employee Salary Roll (${payroll.records?.length || 0} Employees)`}
            subtitle="Calculated live from Daily Production Reports. You can manually adjust Overtime hours anytime by clicking ✏️ in OT Hrs."
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                {canManage && (payroll.status === 'Draft' || payroll.status === 'Calculated') && (
                  <Button size="sm" variant="default" onClick={handleSyncEmployees} loading={syncing} icon="🔄" title="Ensure all new candidates are included">
                    Sync All Candidates
                  </Button>
                )}
                <Button size="sm" onClick={() => endpoints.payroll.exportExcel(payroll._id)} icon="📊">
                  Excel Register
                </Button>
                {canManage && (
                  <Button size="sm" onClick={() => endpoints.payroll.exportBank(payroll._id)} icon="🏦">
                    Bank CSV
                  </Button>
                )}
              </div>
            }
            flush
          >
            <div style={{ overflowX: 'auto', position: 'relative' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Emp ID</th>
                    <th>Employee Name</th>
                    <th>Dept</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'center' }}>P / A</th>
                    <th style={{ textAlign: 'center' }}>OT Hrs (✏️)</th>
                    <th style={{ textAlign: 'center' }}>ST Hrs</th>
                    <th style={{ textAlign: 'right' }}>Basic (₹)</th>
                    <th style={{ textAlign: 'right' }}>OT Pay (₹)</th>
                    <th style={{ textAlign: 'right' }}>ST Cut (₹)</th>
                    <th style={{ textAlign: 'right' }}>Adv Cut (₹)</th>
                    <th style={{ textAlign: 'right' }}>Adj. (₹)</th>
                    <th
                      style={{
                        textAlign: 'right',
                        position: 'sticky',
                        right: 0,
                        background: '#DCFCE7',
                        color: '#166534',
                        fontWeight: 800,
                        zIndex: 2,
                        minWidth: 130,
                      }}
                    >
                      GRAND TOTAL (₹)
                    </th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(payroll.records || []).map((rec) => {
                    const isPopoverOpen = activePopover === rec._id;
                    return (
                      <tr key={rec._id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rec.employeeIdCode}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{rec.employeeName}</div>
                          {rec.isProRata && (
                            <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: 4 }}>
                              Pro-Rata ({rec.effectivePaidDays}d)
                            </span>
                          )}
                        </td>
                        <td className="text-small text-muted">{rec.department || '—'}</td>
                        <td style={{ fontSize: 12 }}>{rec.salaryType}</td>
                        <td style={{ textAlign: 'center', fontSize: 12 }}>
                          <span style={{ color: '#166534', fontWeight: 600 }}>{rec.presentDays}</span> /{' '}
                          <span style={{ color: '#DC2626' }}>{rec.absentDays}</span>
                        </td>
                        {/* Overtime Hours with Clickable Manual Edit */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <span style={{ fontWeight: rec.overtimeHours > 0 ? 700 : 400, color: rec.overtimeHours > 0 ? '#166534' : undefined }}>
                              {rec.overtimeHours > 0 ? `${rec.overtimeHours}h` : '0h'}
                            </span>
                            {canManage && payroll.status !== 'Approved' && payroll.status !== 'Paid' && (
                              <button
                                type="button"
                                title="Click to manually enter or change overtime hours"
                                onClick={() => setOtModal({ open: true, record: rec, hours: rec.overtimeHours !== undefined ? String(rec.overtimeHours) : '' })}
                                style={{
                                  background: 'none',
                                  border: '1px solid #CBD5E1',
                                  borderRadius: 4,
                                  padding: '1px 4px',
                                  cursor: 'pointer',
                                  fontSize: 10,
                                  color: '#2563EB',
                                }}
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                          {rec.isManualOvertime && (
                            <div style={{ fontSize: 9, color: '#7C3AED', fontWeight: 700 }}>MANUAL</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', color: rec.shortTimeHours > 0 ? '#DC2626' : undefined }}>
                          {rec.shortTimeHours > 0 ? `${rec.shortTimeHours}h` : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{rec.basicEarned.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', color: rec.overtimePay > 0 ? '#166534' : undefined, fontWeight: rec.overtimePay > 0 ? 600 : 400 }}>
                          {rec.overtimePay > 0 ? `+${rec.overtimePay.toLocaleString('en-IN')}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', color: rec.shortTimeDeduction > 0 ? '#DC2626' : undefined }}>
                          {rec.shortTimeDeduction > 0 ? `−${rec.shortTimeDeduction.toLocaleString('en-IN')}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', color: rec.advanceDeductedAmount > 0 ? '#D97706' : undefined }}>
                          {rec.advanceDeductedAmount > 0 ? `−${rec.advanceDeductedAmount.toLocaleString('en-IN')}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>
                          {rec.totalAdjustments !== 0 ? (
                            <span style={{ color: rec.totalAdjustments > 0 ? '#166534' : '#DC2626', fontWeight: 600 }}>
                              {rec.totalAdjustments > 0 ? `+${rec.totalAdjustments}` : rec.totalAdjustments}
                            </span>
                          ) : (
                            '0'
                          )}
                        </td>

                        {/* Sticky Grand Total cell with hover calculation breakdown popover */}
                        <td
                          style={{
                            textAlign: 'right',
                            position: 'sticky',
                            right: 0,
                            background: '#DCFCE7',
                            fontWeight: 800,
                            color: '#166534',
                            zIndex: 2,
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setActivePopover(rec._id)}
                          onMouseLeave={() => setActivePopover(null)}
                        >
                          ₹{rec.netPayable.toLocaleString('en-IN')}
                          {isPopoverOpen && (
                            <div
                              style={{
                                position: 'absolute',
                                right: '105%',
                                top: -20,
                                width: 280,
                                background: '#1E293B',
                                color: '#F8FAFC',
                                padding: 12,
                                borderRadius: 8,
                                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                                fontSize: 11,
                                textAlign: 'left',
                                zIndex: 100,
                                pointerEvents: 'none',
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 13, borderBottom: '1px solid #334155', paddingBottom: 4, marginBottom: 8, color: '#38BDF8' }}>
                                {rec.employeeName} ({rec.employeeIdCode})
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                <span>Basic Earned ({rec.effectivePaidDays} days):</span>
                                <span>₹{rec.basicEarned.toLocaleString('en-IN')}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                <span>Overtime Pay ({rec.overtimeHours}h × {rec.otMultiplier}x):</span>
                                <span style={{ color: '#4ADE80' }}>+₹{rec.overtimePay.toLocaleString('en-IN')}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                <span>Short-Time Cut ({rec.shortTimeHours}h):</span>
                                <span style={{ color: '#F87171' }}>−₹{rec.shortTimeDeduction.toLocaleString('en-IN')}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                <span>Advance EMI:</span>
                                <span style={{ color: '#FBBF24' }}>−₹{rec.advanceDeductedAmount.toLocaleString('en-IN')}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                <span>Adjustments (net):</span>
                                <span>₹{rec.totalAdjustments.toLocaleString('en-IN')}</span>
                              </div>
                              <div style={{ borderTop: '1px solid #334155', paddingTop: 6, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#4ADE80', fontSize: 13 }}>
                                <span>NET PAYABLE:</span>
                                <span>₹{rec.netPayable.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {canManage && payroll.status !== 'Approved' && payroll.status !== 'Paid' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => setOtModal({ open: true, record: rec, hours: rec.overtimeHours !== undefined ? String(rec.overtimeHours) : '' })}
                                  title="Enter manual overtime hours"
                                >
                                  ⏱️ OT
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => setAdjModal({ open: true, emp: rec, label: '', amount: '', type: 'Addition' })}
                                  title="Add Bonus or Deduction"
                                >
                                  ➕ Adj
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => endpoints.payroll.exportPayslip(payroll._id, rec.employee)}
                              title="Download PDF Payslip"
                              icon="📄"
                            >
                              Slip
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Workflow Footer Actions */}
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="text-small text-muted">
                Status: <strong>{payroll.status}</strong> | Generated on: {payroll.generatedAt ? new Date(payroll.generatedAt).toLocaleString() : '—'}
                {payroll.approvedAt && ` | Approved on: ${new Date(payroll.approvedAt).toLocaleString()}`}
                {payroll.lockedAt && ` | Permanently Locked on: ${new Date(payroll.lockedAt).toLocaleString()}`}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {canManage && payroll.status === 'Calculated' && (
                  <Button variant="primary" onClick={handleApprove} icon="✅">
                    Approve Payroll (Commit Advance Recovery)
                  </Button>
                )}

                {canManage && payroll.status === 'Approved' && (
                  <Button variant="primary" style={{ background: '#166534' }} onClick={handleMarkPaid} icon="🔒">
                    Mark as Paid & Lock Records Permanently
                  </Button>
                )}

                {payroll.status === 'Paid' && (
                  <Badge tone="green" dot>
                    PAYROLL DISBURSED & LOCKED
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Manual Overtime Modal */}
      <Modal
        open={otModal.open}
        onClose={() => setOtModal({ open: false, record: null, hours: '' })}
        title={`Set Overtime for ${otModal.record?.employeeName || 'Employee'}`}
        subtitle="Manually enter or adjust total overtime hours worked for this month"
      >
        <form onSubmit={handleSaveOvertime} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--slate-050)', padding: 12, borderRadius: 6, fontSize: 12 }}>
            <div>Hourly Rate: <strong>₹{otModal.record?.hourlyRate || 0}/hr</strong></div>
            <div>OT Multiplier: <strong>{otModal.record?.otMultiplier || 1}x</strong></div>
            <div style={{ color: '#166534', fontWeight: 600, marginTop: 4 }}>
              Effective OT Rate: ₹{((otModal.record?.hourlyRate || 0) * (otModal.record?.otMultiplier || 1)).toFixed(2)}/hr
            </div>
          </div>

          <Field label="Total Overtime Hours Worked" required>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="e.g. 12 or 18.5"
              value={otModal.hours}
              onChange={(e) => setOtModal({ ...otModal, hours: e.target.value })}
              required
              autoFocus
            />
          </Field>

          {otModal.hours !== '' && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
              Calculated Overtime Pay: +₹{Math.round((Number(otModal.hours) || 0) * (otModal.record?.hourlyRate || 0) * (otModal.record?.otMultiplier || 1)).toLocaleString('en-IN')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button
              type="button"
              variant="default"
              onClick={() => setOtModal({ open: false, record: null, hours: '' })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingOt}>
              Save Overtime
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manual Adjustment Modal */}
      <Modal
        open={adjModal.open}
        onClose={() => setAdjModal({ open: false, emp: null, label: '', amount: '', type: 'Addition' })}
        title={`Add Adjustment for ${adjModal.emp?.employeeName || 'Employee'}`}
        subtitle="Record festival bonuses, special allowances, or damage penalties prior to approval"
      >
        <form onSubmit={handleAddAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Adjustment Type" required>
            <Select
              value={adjModal.type}
              onChange={(e) => setAdjModal({ ...adjModal, type: e.target.value })}
            >
              <option value="Addition">Addition (+) — Bonus, Allowance, Incentive</option>
              <option value="Deduction">Deduction (−) — Penalty, Equipment Damage, Other</option>
            </Select>
          </Field>

          <Field label="Description / Reason" required>
            <Input
              placeholder="e.g. Diwali Bonus, Tool damage penalty"
              value={adjModal.label}
              onChange={(e) => setAdjModal({ ...adjModal, label: e.target.value })}
              required
            />
          </Field>

          <Field label="Amount (₹)" required>
            <Input
              type="number"
              min="1"
              placeholder="Enter amount in ₹"
              value={adjModal.amount}
              onChange={(e) => setAdjModal({ ...adjModal, amount: e.target.value })}
              required
            />
          </Field>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button
              type="button"
              variant="default"
              onClick={() => setAdjModal({ open: false, emp: null, label: '', amount: '', type: 'Addition' })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingAdj}>
              Add Adjustment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
