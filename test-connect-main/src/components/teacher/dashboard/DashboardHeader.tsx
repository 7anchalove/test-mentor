const DashboardHeader = () => {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight">Teacher Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Manage requests, sessions, and completed work in one place.</p>
      </div>
    </div>
  );
};

export default DashboardHeader;
