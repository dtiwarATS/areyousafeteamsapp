// Cron jobs only process "active" teams/tenants:
//   - the installation is not uninstalled, and
//   - the subscription is not an expired trial (2) or paid (3) plan.
// Free (type 1) and teams with no linked subscription count as active.
// Same expiry rule the SOS reminder jobs use.
//
// Each helper returns an EXISTS(...) predicate for a WHERE clause; pass the
// fully-qualified column of the outer query (e.g. "mst.team_id").

const ACTIVE_SUBSCRIPTION_SQL = `NOT (asd.SubscriptionType IN (2, 3)
             AND asd.ExpiryDate IS NOT NULL
             AND GETDATE() > asd.ExpiryDate)`;

const activeTeamSql = (teamIdColumn) => `EXISTS (
    SELECT 1 FROM MSTeamsInstallationDetails aid
    LEFT JOIN MSTeamsSubscriptionDetails asd ON asd.ID = aid.SubscriptionDetailsId
    WHERE aid.team_id = ${teamIdColumn}
      AND aid.uninstallation_date IS NULL
      AND ${ACTIVE_SUBSCRIPTION_SQL})`;

const activeTenantSql = (tenantIdColumn) => `EXISTS (
    SELECT 1 FROM MSTeamsInstallationDetails aid
    LEFT JOIN MSTeamsSubscriptionDetails asd ON asd.ID = aid.SubscriptionDetailsId
    WHERE aid.user_tenant_id = ${tenantIdColumn}
      AND aid.uninstallation_date IS NULL
      AND ${ACTIVE_SUBSCRIPTION_SQL})`;

module.exports = { activeTeamSql, activeTenantSql };
