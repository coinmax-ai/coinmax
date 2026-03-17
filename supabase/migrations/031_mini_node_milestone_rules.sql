-- Update MINI node milestone rules:
-- V2: unlimited time (deadline_days=0), must reach V2 to withdraw rewards
-- V4: 90 days deadline, unlocks rewards + 10x contribution fund release

-- V2 milestone: set to unlimited (days=0, deadline far future)
UPDATE node_milestones
SET deadline_days = 0,
    deadline_at = '2099-12-31 23:59:59+00'
FROM node_memberships
WHERE node_milestones.membership_id = node_memberships.id
  AND node_memberships.node_type = 'MINI'
  AND node_milestones.required_rank = 'V2'
  AND node_milestones.status = 'PENDING';

-- V4 milestone: ensure 90 days deadline
UPDATE node_milestones
SET deadline_days = 90
FROM node_memberships
WHERE node_milestones.membership_id = node_memberships.id
  AND node_memberships.node_type = 'MINI'
  AND node_milestones.required_rank = 'V4'
  AND node_milestones.status = 'PENDING';

-- Ensure all MINI nodes use 0.9% daily rate
UPDATE node_memberships
SET daily_rate = 0.009
WHERE node_type = 'MINI' AND daily_rate != 0.009;
