import { DateTime } from "luxon";

export const TUNIS_IANA_ZONE = "Africa/Tunis";

export interface TunisSlot {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export const buildUtcIsoFromTunisSlot = (slot: TunisSlot): string => {
  return (
    DateTime.fromObject(
      {
        year: slot.year,
        month: slot.month,
        day: slot.day,
        hour: slot.hour,
        minute: slot.minute,
        second: 0,
        millisecond: 0,
      },
      { zone: TUNIS_IANA_ZONE }
    )
      .toUTC()
      .toISO({ suppressMilliseconds: false }) ?? ""
  );
};

export const getTunisSlotFromDate = (date: Date): TunisSlot => {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
};

export const formatTunisSlot = (slot: TunisSlot, format = "cccc, LLLL d 'at' HH:mm"): string => {
  return DateTime.fromObject(slot, { zone: TUNIS_IANA_ZONE }).toFormat(format);
};
