export default function PendingAccess() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Access Pending</h1>
        <p className="text-muted-foreground">
          Your account has been created successfully, but you are not yet linked
          to a company/branch.
          <br />
          Please contact your administrator to assign you a company, branch and
          role.
        </p>
      </div>
    </div>
  );
}
