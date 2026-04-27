export const getCountdownSeconds = (endsAt?: string | null) => {
  if (!endsAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
};

export const formatCountdown = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

