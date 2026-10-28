import { StatePanel } from "./Shared.jsx";
import WorkshopIcon from "./WorkshopIcon.jsx";

const dayKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
const labels = { Requested: "Needs review", Confirmed: "Confirmed", Scheduled: "Scheduled", InProgress: "In progress", Completed: "Completed", Cancelled: "Cancelled", Rejected: "Rejected" };
const activeStatuses = ["Requested", "Confirmed", "Scheduled", "InProgress"];

export default function DashboardSection({ active, status, errorMessage, customers, vehicles, services, mechanics, appointments, busy, onRetry, onOpenSettings, onNavigate }) {
  const now = new Date();
  const today = dayKey(now);
  const todaysBookings = appointments.filter((appointment) => dayKey(appointment.scheduledAtUtc) === today);
  const needsReview = appointments.filter((appointment) => appointment.status === "Requested");
  const unassigned = appointments.filter((appointment) => ["Confirmed", "Scheduled"].includes(appointment.status) && !appointment.mechanicId);
  const activeMechanics = mechanics.filter((mechanic) => mechanic.isActive);
  const upcoming = appointments.filter((appointment) => activeStatuses.includes(appointment.status) && dayKey(appointment.scheduledAtUtc) >= today).sort((a, b) => Date.parse(a.scheduledAtUtc) - Date.parse(b.scheduledAtUtc)).slice(0, 5);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + index);
    const matching = appointments.filter((appointment) => dayKey(appointment.scheduledAtUtc) === dayKey(date));
    return { date, total: matching.filter((appointment) => activeStatuses.includes(appointment.status) || appointment.status === "Completed").length };
  });
  const maxBookings = Math.max(1, ...days.map((day) => day.total));
  const ready = status === "ready";
  const stats = [
    { label: "Today's appointments", value: todaysBookings.length, note: "All booking statuses", icon: "appointments", target: "appointments", tone: "orange" },
    { label: "Awaiting review", value: needsReview.length, note: "Requests to confirm or reject", icon: "services", target: "appointments", tone: "teal" },
    { label: "Awaiting a mechanic", value: unassigned.length, note: "Confirmed or scheduled bookings", icon: "mechanics", target: "appointments", tone: "orange" },
    { label: "Active mechanics", value: activeMechanics.length, note: `${mechanics.length} staff records in total`, icon: "mechanics", target: "mechanics", tone: "teal" }
  ];

  return <section hidden={!active} aria-labelledby="dashboard-title" className="dashboard-page">
    <div className="dashboard-heading"><div><h1 id="dashboard-title" className="page-title" tabIndex={-1}>Workshop dashboard</h1><p className="page-description">Bookings, staff, and the work ahead.</p></div><button className="button button-primary" disabled={busy || !ready} onClick={() => onNavigate("appointments")} type="button"><WorkshopIcon name="appointments" />View appointments</button></div>
    {!ready ? <div className="dashboard-panel">
      {status === "loading" ? <StatePanel loading title="Loading your workshop" body="Getting the latest bookings, customers, and staff records." />
        : status === "disconnected" ? <StatePanel title="Connect your workshop API" body="Connect the backend to see your workshop overview."><button className="button button-primary" onClick={onOpenSettings} type="button">Set API address</button></StatePanel>
          : <StatePanel error title="The dashboard could not be loaded" body={errorMessage}><button className="button button-primary" onClick={() => void onRetry()} type="button">Try connection again</button><button className="button button-secondary" onClick={onOpenSettings} type="button">Check API settings</button></StatePanel>}
    </div> : <>
      <div className="dashboard-metrics">{stats.map((stat) => <button type="button" className="metric-card" key={stat.label} onClick={() => onNavigate(stat.target)}><span className="metric-top"><span>{stat.label}</span><span className={`metric-icon ${stat.tone}`}><WorkshopIcon name={stat.icon} /></span></span><strong className="metric-value">{stat.value}</strong><span className="metric-note">{stat.note}</span></button>)}</div>
      <div className="dashboard-columns">
        <div className="dashboard-panel booking-chart"><div className="panel-heading"><div><h2>Bookings ahead</h2><p>Active and completed bookings over the next seven days</p></div><span className="period-label">Next 7 days</span></div>
          <div className="booking-bars" role="img" aria-label={`Booking counts: ${days.map((day) => `${dayKey(day.date)}: ${day.total}`).join(", ")}`}>
            {days.map((day, index) => <div className="booking-bar-column" key={dayKey(day.date)}><span className="bar-count">{day.total}</span><div className="bar-track"><div className={`bar-fill ${index === 0 ? "today" : ""}`} style={{ height: `${day.total / maxBookings * 100}%` }} /></div><span className="bar-day">{index === 0 ? "Today" : new Intl.DateTimeFormat("en-MY", { weekday: "short", timeZone: "Asia/Kuala_Lumpur" }).format(day.date)}</span><span className="bar-date">{new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(day.date)}</span></div>)}
          </div>
          <p className="chart-caption"><span className="legend-dot" />Booking count by scheduled date · Malaysia time</p>
        </div>
        <div className="dashboard-side">
          <div className="dashboard-panel attention-panel"><div className="panel-heading"><h2>Needs attention</h2></div><button className="attention-row" type="button" onClick={() => onNavigate("appointments")}><span><strong>Review booking requests</strong><small>Confirm or reject incoming visits</small></span><span className="attention-count">{needsReview.length}</span></button><button className="attention-row" type="button" onClick={() => onNavigate("appointments")}><span><strong>Assign workshop staff</strong><small>Bookings waiting for a mechanic</small></span><span className="attention-count teal">{unassigned.length}</span></button></div>
          <div className="dashboard-panel"><div className="panel-heading"><h2>Workshop records</h2></div><div className="record-totals">{[{ label: "Customers", value: customers.length, target: "customers" }, { label: "Vehicles", value: vehicles.length, target: "vehicles" }, { label: "Active services", value: services.filter((service) => service.isActive).length, target: "services" }].map((item) => <button key={item.label} type="button" onClick={() => onNavigate(item.target)}><span>{item.label}</span><strong>{item.value}</strong><WorkshopIcon name="arrow" /></button>)}</div></div>
        </div>
      </div>
      <div className="dashboard-panel upcoming-panel"><div className="panel-heading"><div><h2>Upcoming workshop visits</h2><p>The next active bookings, including today</p></div><button className="text-action" type="button" onClick={() => onNavigate("appointments")}>View all appointments <WorkshopIcon name="arrow" /></button></div>
        {upcoming.length === 0 ? <div className="dashboard-empty"><WorkshopIcon name="appointments" /><h3>No upcoming visits</h3><p>New bookings will appear here when they are requested.</p><button className="button button-secondary" onClick={() => onNavigate("appointments")} type="button">Go to appointments</button></div>
          : <div className="upcoming-list">{upcoming.map((appointment) => <div className="upcoming-row" key={appointment.id}><div className="visit-date"><strong>{new Intl.DateTimeFormat("en-MY", { day: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(appointment.scheduledAtUtc))}</strong><span>{new Intl.DateTimeFormat("en-MY", { month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(appointment.scheduledAtUtc))}</span></div><div className="visit-customer"><strong>{appointment.customerName}</strong><span>{appointment.registrationNumber} · {appointment.vehicleName}</span></div><div className="visit-time"><strong>{new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(appointment.scheduledAtUtc))}</strong><span>{appointment.mechanicName || "No mechanic assigned"}</span></div><span className={`booking-status status-${appointment.status}`}>{labels[appointment.status] ?? appointment.status}</span></div>)}</div>}
      </div>
    </>}
  </section>;
}
