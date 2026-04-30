import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	SessionStatusDiff,
	SessionStatusMap,
	SoundPlaybackDecision,
} from "../ingest/session-diff";
import {
	buildSessionStatusMap,
	diffSessionStatuses,
	shouldPlaySound,
} from "../ingest/session-diff";
import { ATTENTION_FIRST_PRIORITY } from "../ingest/status-rollup";
import type {
	DashboardMultiProjectPayload,
	PlanStatus,
	ProjectSnapshot,
	SoundConfig,
	StripConfigState,
} from "../types";
import { ColumnResizeHandle } from "./components/ColumnResizeHandle";
import { DashboardHeader } from "./components/DashboardHeader";
import { PlanProgress } from "./components/PlanProgress";
import { PreviewNav } from "./components/PreviewNav";
import { ProjectManagementPanel } from "./components/ProjectManagementPanel";
import { ProjectStrip } from "./components/ProjectStrip";
import { SessionSwimlane } from "./components/SessionSwimlane";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sparkline } from "./components/Sparkline";
import "./App.css";
import type { DragEndEvent } from "@dnd-kit/core";
import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type React from "react";
import { useDensityMode } from "./hooks/useDensityMode";
import { useExpandState } from "./hooks/useExpandState";
import { useProjectOrder } from "./hooks/useProjectOrder";
import { useProjectVisibility } from "./hooks/useProjectVisibility";
import { useSoundNotifications } from "./hooks/useSoundNotifications";
import { useStripConfig } from "./hooks/useStripConfig";
import type { PreviewMode } from "./types";

/* ── Helpers ── */

type ProjectSessionStatusMaps = Map<string, SessionStatusMap>;
type ProjectPlanStatuses = Map<string, PlanStatus>;

export type ProjectSoundDecision = {
	sourceId: string;
	diff: SessionStatusDiff;
	playback: SoundPlaybackDecision;
};

export function compareProjects(
	a: ProjectSnapshot,
	b: ProjectSnapshot,
): number {
	const pa =
		ATTENTION_FIRST_PRIORITY[a.aggregateStatus] ??
		ATTENTION_FIRST_PRIORITY.unknown;
	const pb =
		ATTENTION_FIRST_PRIORITY[b.aggregateStatus] ??
		ATTENTION_FIRST_PRIORITY.unknown;
	if (pa !== pb) return pa - pb;
	return b.lastUpdatedMs - a.lastUpdatedMs;
}

export function resolveProjectOrderIds(
	sortedProjects: ProjectSnapshot[],
	orderedIds: string[],
	isManualOrder: boolean,
): string[] {
	const currentIds = sortedProjects.map((project) => project.sourceId);
	if (!isManualOrder) return currentIds;

	const retained = orderedIds.filter((id) => currentIds.includes(id));
	const added = currentIds.filter((id) => !orderedIds.includes(id));
	return [...retained, ...added];
}

function buildProjectSessionMaps(
	projects: ProjectSnapshot[],
): ProjectSessionStatusMaps {
	return new Map(
		projects.map((project) => [
			project.sourceId,
			buildSessionStatusMap(project.sessions),
		]),
	);
}

function buildProjectPlanStatuses(
	projects: ProjectSnapshot[],
): ProjectPlanStatuses {
	return new Map(
		projects.map((project) => [project.sourceId, project.planProgress.status]),
	);
}

export function computeProjectSoundDecisions(args: {
	previousSessionMaps: ProjectSessionStatusMaps;
	previousPlanStatuses: ProjectPlanStatuses;
	projects: ProjectSnapshot[];
	soundConfig: SoundConfig;
}): {
	decisions: ProjectSoundDecision[];
	nextSessionMaps: ProjectSessionStatusMaps;
	nextPlanStatuses: ProjectPlanStatuses;
} {
	const { previousSessionMaps, previousPlanStatuses, projects, soundConfig } =
		args;
	const nextSessionMaps = buildProjectSessionMaps(projects);
	const nextPlanStatuses = buildProjectPlanStatuses(projects);
	const decisions: ProjectSoundDecision[] = [];

	for (const project of projects) {
		const diff = diffSessionStatuses(
			previousSessionMaps.get(project.sourceId) ?? new Map(),
			nextSessionMaps.get(project.sourceId) ?? new Map(),
			{
				prevPlanStatus: previousPlanStatuses.get(project.sourceId),
				currPlanStatus: project.planProgress.status,
			},
		);

		decisions.push({
			sourceId: project.sourceId,
			diff,
			playback: shouldPlaySound(diff, soundConfig),
		});
	}

	return { decisions, nextSessionMaps, nextPlanStatuses };
}

/* ── Props ── */

export type AppProps = {
	data: DashboardMultiProjectPayload | null;
	connected: boolean;
	lastUpdatedMs: number | null;
	previewMode: PreviewMode | null;
	refresh: () => Promise<void>;
};

export type ActiveOverlay = "none" | "settings" | "projectManagement";

/* ── localStorage helpers ── */

function safeGetItem(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSetItem(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* localStorage may be unavailable */
	}
}

/* ── Component ── */

export function App({
	data,
	connected,
	lastUpdatedMs,
	previewMode,
	refresh,
}: AppProps) {
	const { expandedIds, toggle, expandAll, collapseAll } = useExpandState();
	const {
		config: soundConfig,
		setConfig: setSoundConfig,
		playWaiting,
		playAllClear,
		playAttention,
		playQuestion,
	} = useSoundNotifications();
	const { orderedIds, columns, reorder, setColumns, syncIds } =
		useProjectOrder();
	const { visibility, isVisible, toggleVisibility } = useProjectVisibility();
	const {
		config: stripConfig,
		toggle: toggleStripConfig,
		setMode: setStripMode,
	} = useStripConfig();
	const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>("none");

	/* ── Zoom ── */
	const [zoom, setZoom] = useState<number>(() => {
		const saved = safeGetItem("dashboard-zoom");
		return saved ? parseFloat(saved) : 1.8;
	});

	useEffect(() => {
		safeSetItem("dashboard-zoom", String(zoom));
		document.documentElement.style.setProperty("--zoom", String(zoom));
	}, [zoom]);

	const handleZoomIn = useCallback(() => {
		setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10));
	}, []);

	const handleZoomOut = useCallback(() => {
		setZoom((z) => Math.max(0.1, Math.round((z - 0.1) * 10) / 10));
	}, []);

	const handleZoomReset = useCallback(() => {
		setZoom(1.8);
	}, []);

	/* ── Collapsed pane height & grid gap ── */
	const [collapsedHeight, setCollapsedHeight] = useState<number>(() => {
		const saved = safeGetItem("dashboard-collapsed-height");
		return saved ? parseInt(saved, 10) : 40;
	});

	const [gridGap, setGridGap] = useState<number>(() => {
		const saved = safeGetItem("dashboard-grid-gap");
		return saved ? parseInt(saved, 10) : 10;
	});

	useEffect(() => {
		safeSetItem("dashboard-collapsed-height", String(collapsedHeight));
		document.documentElement.style.setProperty(
			"--collapsed-pane-height",
			`${collapsedHeight}px`,
		);
	}, [collapsedHeight]);

	useEffect(() => {
		safeSetItem("dashboard-grid-gap", String(gridGap));
		document.documentElement.style.setProperty("--grid-gap", `${gridGap}px`);
	}, [gridGap]);

	/* ── Idle timeout ── */
	const [idleTimeoutMs, setIdleTimeoutMs] = useState<number>(() => {
		const stored = safeGetItem("idle-timeout-ms");
		return stored ? Number(stored) : 300_000; // 5 min default
	});

	useEffect(() => {
		safeSetItem("idle-timeout-ms", String(idleTimeoutMs));
	}, [idleTimeoutMs]);

	/* ── Column widths ── */
	const [columnWidths, setColumnWidths] = useState<Record<string, number[]>>(
		() => {
			try {
				const raw = safeGetItem("dashboard-column-widths");
				if (!raw) return {};
				const parsed: unknown = JSON.parse(raw);
				if (
					typeof parsed === "object" &&
					parsed !== null &&
					!Array.isArray(parsed)
				) {
					return parsed as Record<string, number[]>;
				}
				return {};
			} catch {
				return {};
			}
		},
	);

	useEffect(() => {
		safeSetItem("dashboard-column-widths", JSON.stringify(columnWidths));
	}, [columnWidths]);

	const currentWidths = useMemo(() => {
		return columnWidths[String(columns)] ?? Array(columns).fill(1);
	}, [columnWidths, columns]);

	const handleColumnResize = useCallback(
		(columnIndex: number, deltaFraction: number) => {
			setColumnWidths((prev) => {
				const key = String(columns);
				const widths = [...(prev[key] ?? Array(columns).fill(1))];
				const totalFr = widths.reduce((a, b) => a + b, 0);
				const delta = deltaFraction * totalFr;

				const minFr = 200 / (window.innerWidth / columns);

				let left = widths[columnIndex] + delta;
				let right = widths[columnIndex + 1] - delta;

				if (left < minFr) {
					right -= minFr - left;
					left = minFr;
				}
				if (right < minFr) {
					left -= minFr - right;
					right = minFr;
				}

				widths[columnIndex] = Math.round(left * 100) / 100;
				widths[columnIndex + 1] = Math.round(right * 100) / 100;

				return { ...prev, [key]: widths };
			});
		},
		[columns],
	);
	const handleCloseOverlay = useCallback(() => setActiveOverlay("none"), []);
	const firstLoadRef = useRef(true);
	const prevSessionMapsRef = useRef<ProjectSessionStatusMaps>(new Map());
	const prevPlanStatusesRef = useRef<ProjectPlanStatuses>(new Map());

	const handleExpandAll = useCallback(() => {
		if (!data) return;
		expandAll(data.projects.map((p) => p.sourceId));
	}, [data, expandAll]);

	/* Sound notifications on status transitions */
	useEffect(() => {
		if (!data || !connected) return;

		const { decisions, nextSessionMaps, nextPlanStatuses } =
			computeProjectSoundDecisions({
				previousSessionMaps: prevSessionMapsRef.current,
				previousPlanStatuses: prevPlanStatusesRef.current,
				projects: data.projects,
				soundConfig,
			});

		// Skip sound on first successful load
		if (firstLoadRef.current) {
			firstLoadRef.current = false;
			prevSessionMapsRef.current = nextSessionMaps;
			prevPlanStatusesRef.current = nextPlanStatuses;
			return;
		}

		for (const decision of decisions) {
			if (decision.playback.playWaiting) {
				playWaiting();
			}

			if (decision.playback.playAttention) {
				playAttention();
			}

			if (decision.playback.playAllClear) {
				playAllClear();
			}

			if (decision.playback.playQuestion) {
				playQuestion();
			}
		}

		prevSessionMapsRef.current = nextSessionMaps;
		prevPlanStatusesRef.current = nextPlanStatuses;
	}, [
		data,
		connected,
		soundConfig,
		playWaiting,
		playAllClear,
		playAttention,
		playQuestion,
	]);

	const sortedProjects = useMemo(() => {
		if (!data) return [];
		return [...data.projects].sort(compareProjects);
	}, [data]);

	/* Sync orderedIds when project list changes */
	useEffect(() => {
		if (sortedProjects.length > 0) {
			syncIds(sortedProjects.map((p) => p.sourceId));
		}
	}, [sortedProjects, syncIds]);

	const currentOrderIds = useMemo(
		() =>
			resolveProjectOrderIds(sortedProjects, orderedIds, orderedIds.length > 0),
		[sortedProjects, orderedIds],
	);

	/* Display projects in DnD order when available, else status sort; then filter by visibility */
	const displayProjects = useMemo(() => {
		const map = new Map(sortedProjects.map((p) => [p.sourceId, p]));
		const ordered = currentOrderIds
			.map((id) => map.get(id))
			.filter((p): p is ProjectSnapshot => p !== undefined);
		return ordered.filter((p) => isVisible(p.sourceId));
	}, [sortedProjects, currentOrderIds, isVisible]);

	const resizeHandleIds = useMemo(
		() =>
			Array.from(
				{ length: Math.max(columns - 1, 0) },
				(_, handleIndex) => `column-resize-handle-${handleIndex + 1}`,
			),
		[columns],
	);

	const effectiveStripConfig = useMemo(() => {
		if (!previewMode) return stripConfig;
		return {
			...stripConfig,
			showProjectName: true,
			showStatusDot: true,
			showAvatar: true,
		};
	}, [previewMode, stripConfig]);

	const isPreviewMode = previewMode !== null;

	const effectiveExpandedIds = useMemo(() => {
		if (!isPreviewMode) return expandedIds;
		const previewIds = new Set<string>();
		if (data) {
			for (const project of data.projects) {
				if (project.sourceId.startsWith("preview-")) {
					previewIds.add(project.sourceId);
				}
			}
		}
		const filtered = new Set(expandedIds);
		for (const id of previewIds) {
			filtered.delete(id);
		}
		return filtered;
	}, [isPreviewMode, expandedIds, data]);

	const projectCount = displayProjects.length;
	const density = useDensityMode(projectCount);

	/* DnD sensors — 8px activation distance to avoid conflicts with click-to-expand */
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = currentOrderIds.indexOf(String(active.id));
			const newIndex = currentOrderIds.indexOf(String(over.id));

			if (oldIndex !== -1 && newIndex !== -1) {
				reorder(oldIndex, newIndex);
			}
		},
		[currentOrderIds, reorder],
	);

	const handleSettingsOpen = useCallback(
		() => setActiveOverlay("settings"),
		[],
	);
	const handleManageProjectsOpen = useCallback(
		() => setActiveOverlay("projectManagement"),
		[],
	);
	const handleEmptyManageProjects = useCallback(
		() => setActiveOverlay("projectManagement"),
		[],
	);
	const handleTestSound = useCallback(
		(event: "idle" | "complete" | "error" | "question") => {
			if (event === "idle") playWaiting();
			if (event === "complete") playAllClear();
			if (event === "error") playAttention();
			if (event === "question") playQuestion();
		},
		[playWaiting, playAllClear, playAttention, playQuestion],
	);

	return (
		<div className="page" data-density={density}>
			<DashboardHeader
				connected={connected}
				lastUpdatedMs={lastUpdatedMs}
				onExpandAll={handleExpandAll}
				onCollapseAll={collapseAll}
				columns={columns}
				onSetColumns={setColumns}
				onSettingsOpen={handleSettingsOpen}
				onManageProjectsOpen={handleManageProjectsOpen}
				zoom={zoom}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onZoomReset={handleZoomReset}
			/>
			<div className="container">
				{data === null ? (
					<div className="dashboard-loading">Loading…</div>
				) : projectCount === 0 && data.projects.length === 0 ? (
					<div className="dashboard-empty">
						<span className="dashboard-empty__icon">⊘</span>
						<span>No registered projects found</span>
						<button
							type="button"
							className="dashboard-empty__action"
							onClick={handleEmptyManageProjects}
						>
							Manage Projects
						</button>
					</div>
				) : projectCount === 0 ? (
					<div className="dashboard-empty">
						<span className="dashboard-empty__icon">⊘</span>
						<span>
							All projects hidden — adjust visibility in Manage Projects
						</span>
						<button
							type="button"
							className="dashboard-empty__action"
							onClick={handleEmptyManageProjects}
						>
							Manage Projects
						</button>
					</div>
				) : (
					<>
						{previewMode && <PreviewNav previewMode={previewMode} />}
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={displayProjects.map((project) => project.sourceId)}
								strategy={verticalListSortingStrategy}
							>
								<div
									className="project-stack"
									style={{
										gridTemplateColumns: currentWidths
											.map((w: number) => `${w}fr`)
											.join(" "),
									}}
								>
									{displayProjects.map((project) => {
										const expanded = effectiveExpandedIds.has(project.sourceId);
										return (
											<SortableProjectStrip
												key={project.sourceId}
												id={project.sourceId}
												project={project}
												expanded={expanded}
												onToggleExpand={() => toggle(project.sourceId)}
												stripConfig={effectiveStripConfig}
												idleTimeoutMs={idleTimeoutMs}
											/>
										);
									})}
									{columns > 1 &&
										resizeHandleIds.map((handleId, i: number) => {
											const totalFr = currentWidths.reduce(
												(a: number, b: number) => a + b,
												0,
											);
											const precedingFr = currentWidths
												.slice(0, i + 1)
												.reduce((a: number, b: number) => a + b, 0);
											const leftPercent = (precedingFr / totalFr) * 100;
											return (
												<ColumnResizeHandle
													key={handleId}
													columnIndex={i}
													onResize={(delta) => handleColumnResize(i, delta)}
													style={{ left: `${leftPercent}%` }}
												/>
											);
										})}
								</div>
							</SortableContext>
						</DndContext>
					</>
				)}
			</div>

			<SettingsPanel
				stripConfig={stripConfig}
				onToggleStrip={toggleStripConfig}
				onSetStripMode={setStripMode}
				soundConfig={soundConfig}
				onSoundConfigChange={setSoundConfig}
				onTestSound={handleTestSound}
				open={activeOverlay === "settings"}
				onClose={handleCloseOverlay}
				onOpenProjectManagement={handleManageProjectsOpen}
				collapsedHeight={collapsedHeight}
				onCollapsedHeightChange={setCollapsedHeight}
				gridGap={gridGap}
				onGridGapChange={setGridGap}
				idleTimeoutMs={idleTimeoutMs}
				onIdleTimeoutMsChange={setIdleTimeoutMs}
			/>

			<ProjectManagementPanel
				open={activeOverlay === "projectManagement"}
				onClose={handleCloseOverlay}
				projects={data?.projects ?? []}
				orderedIds={orderedIds}
				visibility={visibility}
				onToggleVisibility={toggleVisibility}
				onReorder={reorder}
				onProjectAdded={refresh}
				onRefresh={refresh}
				onOpenSettings={handleSettingsOpen}
			/>
		</div>
	);
}

/* ── Sortable wrapper ── */

type SortableProjectStripProps = {
	id: string;
	project: ProjectSnapshot;
	expanded: boolean;
	onToggleExpand: () => void;
	stripConfig?: StripConfigState;
	idleTimeoutMs: number;
};

function SortableProjectStrip({
	id,
	project,
	expanded,
	onToggleExpand,
	stripConfig,
	idleTimeoutMs,
}: SortableProjectStripProps) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<ProjectStripWithChildren
				project={project}
				expanded={expanded}
				onToggleExpand={onToggleExpand}
				stripConfig={stripConfig}
				idleTimeoutMs={idleTimeoutMs}
			/>
		</div>
	);
}

/* ── Wired ProjectStrip with embedded Sparkline + PlanProgress ── */

type ProjectStripWithChildrenProps = {
	project: ProjectSnapshot;
	expanded: boolean;
	onToggleExpand: () => void;
	stripConfig?: StripConfigState;
	idleTimeoutMs: number;
};

function ProjectStripWithChildren({
	project,
	expanded,
	onToggleExpand,
	stripConfig,
	idleTimeoutMs,
}: ProjectStripWithChildrenProps) {
	return (
		<ProjectStrip
			project={project}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
			stripConfig={stripConfig}
			idleTimeoutMs={idleTimeoutMs}
		>
			{{
				miniSparkline: (
					<Sparkline mode="mini" timeSeries={project.timeSeries} />
				),
				compactPlan: (
					<PlanProgress planProgress={project.planProgress} mode="compact" />
				),
				fullPlan: (
					<PlanProgress planProgress={project.planProgress} mode="full" />
				),
				sessionSwimlane: (
					<SessionSwimlane sessionTimeSeries={project.sessionTimeSeries} />
				),
			}}
		</ProjectStrip>
	);
}
