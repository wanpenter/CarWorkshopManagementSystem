# Workshop Registry

A local workshop staff tool backed by ASP.NET Core and MySQL, with a React/Vite
frontend. Current modules are customers, owner-linked vehicles, service catalogue,
appointments, and mechanics. The dashboard summarizes those existing records.

Staff maintain records, review requested appointments, assign active mechanics,
and progress jobs to completion. The API enforces ownership, working hours,
capacity, status transitions, and overlapping vehicle/mechanic scheduling rules.

Appointment times are stored in UTC and displayed in Malaysia time. Service
names, prices, and durations are retained as booking snapshots. Authentication,
invoicing, payments, and separate actual-service-history records are not implemented.

The frontend redesign is a working draft for user review, using the supplied
admin-dashboard image as visual direction. Existing record operations must
continue to work. The React frontend under src/CarWorkshop.Web is the target;
the separate older Sites frontend is outside this redesign.
