export function analyticsRange(today, days = 7) {
  const date = new Date(today + 'T00:00:00Z');
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 93 ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== today
  )
    throw Error('Invalid analytics range');
  date.setUTCDate(date.getUTCDate() - days + 1);
  return { from: date.toISOString().slice(0, 10), to: today };
}
export function metricNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'N/A'
    : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(Number(value));
}
export function createAnalyticsData(client) {
  return {
    async load({ from, to, doctorId }) {
      const { data, error } = await client.rpc('get_clinic_analytics', {
        p_from: from,
        p_to: to,
        p_doctor_id: doctorId || null
      });
      if (error) throw error;
      if (!data?.summary) throw Error('Incomplete analytics response');
      return data;
    }
  };
}
