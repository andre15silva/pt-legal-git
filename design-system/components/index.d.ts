import type * as React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'quiet' | 'ghost' }
export declare function Button(props: ButtonProps): React.ReactElement;
export type Status = 'vigor' | 'futuro' | 'revogado' | 'aditado' | 'pendente' | 'verificado' | 'nao-verificado' | 'inconstitucional';
export interface StatusPillProps { status: Status; title?: string; children?: React.ReactNode }
export declare function StatusPill(props: StatusPillProps): React.ReactElement;
export interface Act { index: number; label: string; date?: string }
export interface ActChipProps { act: Act; onClick?: () => void; selected?: boolean }
export declare function ActChip(props: ActChipProps): React.ReactElement;
export interface Segment { op: 'eq' | 'ins' | 'del'; text: string }
export interface RedlineProps { segments: Segment[]; mode?: 'inline' | 'final' | 'previous'; number?: string; caption?: string; legend?: boolean }
export declare function Redline(props: RedlineProps): React.ReactElement;
export interface OriginParagraph { number?: string; spans: { text: string; act: number }[] }
export interface TextOriginProps { paragraphs: OriginParagraph[]; acts: Act[]; focus?: number }
export declare function TextOrigin(props: TextOriginProps): React.ReactElement;
export interface DateLensProps { date?: string; basis?: 'vigor' | 'efeitos' | 'publicacao'; onChange?: (v: { date: string; basis: string }) => void; id?: string; today?: string }
export declare function DateLens(props: DateLensProps): React.ReactElement;
export interface Version { id: string; title: string; href?: string; act: string; published?: string; inForce?: string; until?: string; summary?: string; verification?: Status; technical?: boolean; pending?: boolean }
export interface VersionTimelineProps { versions: Version[]; current?: string; label?: string }
export declare function VersionTimeline(props: VersionTimelineProps): React.ReactElement;
export interface Stage { label: string; date?: string; state: 'done' | 'current' | 'todo' | 'stopped'; note?: string }
export interface ProcessTrackProps { stages: Stage[]; title?: string }
export declare function ProcessTrack(props: ProcessTrackProps): React.ReactElement;
export interface GroupVote { group: string; seats?: number; vote: 'favor' | 'contra' | 'abstencao' | 'ausente' }
export interface VoteBarProps { votes: GroupVote[]; title?: string; result?: string }
export declare function VoteBar(props: VoteBarProps): React.ReactElement;
export interface CitationProps { text: string; permalink?: string }
export declare function Citation(props: CitationProps): React.ReactElement;
export interface SourceNoteProps { children?: React.ReactNode; source?: { href: string; label: string }; updated?: string; verification?: Status; tone?: 'aviso' }
export declare function SourceNote(props: SourceNoteProps): React.ReactElement;
declare global { interface Window { Redacao: { Button: typeof Button; StatusPill: typeof StatusPill; ActChip: typeof ActChip; Redline: typeof Redline; TextOrigin: typeof TextOrigin; DateLens: typeof DateLens; VersionTimeline: typeof VersionTimeline; ProcessTrack: typeof ProcessTrack; VoteBar: typeof VoteBar; Citation: typeof Citation; SourceNote: typeof SourceNote; dataPorExtenso(iso: string): string } } }
