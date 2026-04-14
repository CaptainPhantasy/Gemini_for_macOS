// Scheduler installer — generates install/uninstall commands and launchd plist
// for scheduled GEMINI actions. Pure functions; no side effects.
//
// The browser-sandboxed UI cannot directly run crontab or launchctl, so the UI
// calls these helpers to produce strings that the user pastes into Terminal.

import { cronToLaunchd, type LaunchdCalendarInterval, type TranslationResult } from './cron-to-launchd';

export type ScheduledAction = {
  id: string;
  cron: string;
  prompt: string;
  enabled: boolean;
};

export type InstallPlan = {
  actionId: string;
  cronLine: string;
  launchdPath: string;
  launchdPlist: string;
  installCommand: string;
  uninstallCommand: string;
};

export type UninstallPlan = Pick<InstallPlan, 'actionId' | 'uninstallCommand'>;

const LABEL_PREFIX = 'com.douglas.gemini-for-macos';
const NODE_BIN = '/usr/bin/env node';

function labelFor(actionId: string): string {
  return `${LABEL_PREFIX}.${actionId}`;
}

function launchdPlistPath(actionId: string): string {
  return `~/Library/LaunchAgents/${labelFor(actionId)}.plist`;
}

function escapeShellSingleQuoted(value: string): string {
  // Replace ' with '\'' for safe single-quoted shell embedding
  return value.replace(/'/g, `'\\''`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderIntervalEntry(entry: LaunchdCalendarInterval): string {
  const lines: string[] = ['    <dict>'];
  const keys: Array<keyof LaunchdCalendarInterval> = ['Minute', 'Hour', 'Day', 'Weekday', 'Month'];
  for (const k of keys) {
    const v = entry[k];
    if (typeof v === 'number') {
      lines.push(`      <key>${k}</key><integer>${v}</integer>`);
    }
  }
  lines.push('    </dict>');
  return lines.join('\n');
}

function renderStartCalendarInterval(intervals: LaunchdCalendarInterval[]): string {
  if (intervals.length === 1) {
    return [
      '  <key>StartCalendarInterval</key>',
      renderIntervalEntry(intervals[0]).replace(/^ {4}/gm, '  '),
    ].join('\n');
  }
  const body = intervals.map(renderIntervalEntry).join('\n');
  return ['  <key>StartCalendarInterval</key>', '  <array>', body, '  </array>'].join('\n');
}

function buildLaunchdPlist(
  actionId: string,
  scriptPath: string,
  intervals: LaunchdCalendarInterval[]
): string {
  const label = labelFor(actionId);
  const scheduleXml = renderStartCalendarInterval(intervals);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${escapeXml(label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    '    <string>/usr/bin/env</string>',
    '    <string>node</string>',
    `    <string>${escapeXml(scriptPath)}</string>`,
    `    <string>${escapeXml(actionId)}</string>`,
    '  </array>',
    scheduleXml,
    '  <key>RunAtLoad</key>',
    '  <false/>',
    '  <key>StandardOutPath</key>',
    `  <string>/tmp/${escapeXml(label)}.out.log</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>/tmp/${escapeXml(label)}.err.log</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function buildCronLine(actionId: string, cron: string, scriptPath: string): string {
  // Keep cron expression verbatim; shell-escape the script path in case of spaces
  const escaped = escapeShellSingleQuoted(scriptPath);
  return `${cron} ${NODE_BIN} '${escaped}' ${actionId} # gemini-for-macos:${actionId}`;
}

function buildInstallCommand(cronLine: string, launchdPath: string, plistContent: string): string {
  const escapedLine = escapeShellSingleQuoted(cronLine);
  const escapedPlist = escapeShellSingleQuoted(plistContent);
  const escapedPath = escapeShellSingleQuoted(launchdPath);
  return [
    `(crontab -l 2>/dev/null; echo '${escapedLine}') | crontab -`,
    `mkdir -p ~/Library/LaunchAgents`,
    `printf '%s' '${escapedPlist}' > ${escapedPath}`,
    `launchctl unload ${escapedPath} 2>/dev/null || true`,
    `launchctl load ${escapedPath}`,
  ].join(' && ');
}

function buildUninstallCommand(actionId: string, launchdPath: string): string {
  const marker = `gemini-for-macos:${actionId}`;
  const escapedPath = escapeShellSingleQuoted(launchdPath);
  const escapedMarker = escapeShellSingleQuoted(marker);
  return [
    `launchctl unload ${escapedPath} 2>/dev/null || true`,
    `rm -f ${escapedPath}`,
    `(crontab -l 2>/dev/null | grep -v '${escapedMarker}') | crontab -`,
  ].join(' && ');
}

function fallbackIntervals(): LaunchdCalendarInterval[] {
  // Default to hourly on the 0th minute when translation fails but user still wants a plist.
  return [{ Minute: 0 }];
}

export const scheduler = {
  buildInstallPlan(action: ScheduledAction, scriptPath: string): InstallPlan {
    const launchdPath = launchdPlistPath(action.id);
    const cronLine = buildCronLine(action.id, action.cron, scriptPath);
    const translation: TranslationResult = cronToLaunchd(action.cron);
    const intervals = translation.ok ? translation.intervals : fallbackIntervals();
    const launchdPlist = buildLaunchdPlist(action.id, scriptPath, intervals);
    const installCommand = buildInstallCommand(cronLine, launchdPath, launchdPlist);
    const uninstallCommand = buildUninstallCommand(action.id, launchdPath);
    return {
      actionId: action.id,
      cronLine,
      launchdPath,
      launchdPlist,
      installCommand,
      uninstallCommand,
    };
  },

  buildUninstallPlan(actionId: string): UninstallPlan {
    const launchdPath = launchdPlistPath(actionId);
    return {
      actionId,
      uninstallCommand: buildUninstallCommand(actionId, launchdPath),
    };
  },
};
