# Maintenance contract

This reference belongs to the
[maintenance-automation skill](../SKILL.md). State every item below before
implementing recurring automation, then choose the trigger. The last
section covers remote coordination objects.

Before implementation, state:

- the repeated symptom and retained evidence;
- the single authority and the state derived from it;
- the trigger: event, changed path, release boundary, or justified schedule;
- inputs, outputs, limits, timeout, permissions, and secret boundary;
- read-only check and explicit repair behaviour;
- idempotence and partial-failure behaviour;
- fixed inventory, proposal, retry, time, and output caps;
- focused tests and the impacted CI lanes;
- the operator-visible failure route; and
- the durable evidence location and retention period; and
- the condition under which the automation should be removed or superseded.

Choose an event or changed-path trigger when it represents the real cause. A
scheduled job needs a documented cadence based on staleness cost, not habit.
Prefer an off-minute schedule with a manual dry-run or check entry point when a
schedule is justified. Serialize overlapping runs and do not cancel an
in-progress remote repair. Never respond to a slow gate by running it more
often.

## Remote coordination objects

A remote coordination object needs a stable hidden marker or fingerprint.
Search before creation, update exactly one managed match, preflight exact labels
and numeric milestones, then read the object back. Do not infer issue-to-
milestone assignments without a committed mapping and explicit maintainer
approval. A broad maintenance request is not permission for consequential
remote mutation; reconfirm that boundary immediately before the write.
