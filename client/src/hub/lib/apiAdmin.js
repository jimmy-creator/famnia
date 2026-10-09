import { get } from './api';

/** The one activity log, filtered: { from, to, action, module, overrides }. */
export const activityLogQuery = (filters) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v === true ? 'true' : v);
  params.set('limit', '500');
  return {
    queryKey: ['femnia', 'activity', 'filtered', filters],
    queryFn: () => get(`/hub/activity?${params.toString()}`),
  };
};

/** Actions and modules that appear in the log, for the filter dropdowns. */
export const activityOptionsQuery = {
  queryKey: ['femnia', 'activity', 'options'],
  queryFn: () => get('/hub/activity/options'),
  staleTime: 60_000,
};
