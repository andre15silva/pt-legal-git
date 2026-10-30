import type * as React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'quiet' | 'ghost' }
export declare function Button(props: ButtonProps): React.ReactElement;
export type Status = 'vigor' | 'futuro' | 'revogado' | 'aditado' | 'pendente' | 'verificado' | 'nao-verificado' | 'inconstitucional' | 'historico' | 'atual';
export interface StatusPillProps { status: Status; title?: string; children?: React.ReactNode }
export declare function StatusPill(props: StatusPillProps): React.ReactElement;
export interface Act { index: number; label: string; date?: string; href?: string; hrefLabel?: string; diffHref?: string; beforeHref?: string }
export interface ActChipProps { act: Act; onClick?: () => void; selected?: boolean }
export declare function ActChip(props: ActChipProps): React.ReactElement;
export interface Segment { op: 'eq' | 'ins' | 'del'; text: string }
export interface RedlineProps { segments: Segment[]; mode?: 'inline' | 'final' | 'previous'; number?: string; caption?: string; legend?: boolean }
export declare function Redline(props: RedlineProps): React.ReactElement;
export interface OriginParagraph { number?: string; spans: { text: string; act: number }[] }
export interface TextOriginProps { paragraphs: OriginParagraph[]; acts: Act[]; focus?: number; legendLabel?: string }
export declare function TextOrigin(props: TextOriginProps): React.ReactElement;
export interface DateLensProps { date?: string; basis?: 'vigor' | 'efeitos' | 'publicacao'; onChange?: (v: { date: string; basis: string }) => void; id?: string; today?: string }
export declare function DateLens(props: DateLensProps): React.ReactElement;
export interface Version { id: string; title: string; href?: string; act: string; published?: string; inForce?: string; until?: string; summary?: string; verification?: Status; technical?: boolean; pending?: boolean; links?: { href: string; label: string }[] }
export interface VersionTimelineProps { versions: Version[]; current?: string; inForceToday?: string; label?: string }
export interface VersionBarItem { label: string; start: string; technical?: boolean; pending?: boolean }
export interface VersionBarProps { versions: VersionBarItem[]; current: number; onGo: (i: number) => void; status: React.ReactNode; today?: string; id?: string; heading?: string; onList?: () => void }
export declare function VersionBar(props: VersionBarProps): React.ReactElement;
export declare function VersionTimeline(props: VersionTimelineProps): React.ReactElement;
export interface Stage { label: string; date?: string; state: 'done' | 'current' | 'todo' | 'stopped'; note?: string }
export interface ProcessTrackProps { stages: Stage[]; title?: string }
export declare function ProcessTrack(props: ProcessTrackProps): React.ReactElement;
export interface GroupVote { group: string; seats?: number; vote: 'favor' | 'contra' | 'abstencao' | 'ausente' }
export interface VoteBarProps { votes: GroupVote[]; title?: string; result?: string }
export declare function VoteBar(props: VoteBarProps): React.ReactElement;
export interface VotacaoProps { grupos: Record<string, 'favor' | 'contra' | 'abstencao'>; ordem?: string[]; contagens?: Record<string, Record<string, number>>; dissidencia?: { grupo: string; sentido: string; n?: number; nome?: string }[]; foraDeGrupo?: { nome: string; sentido: string }[]; ausentes?: string[]; semRegisto?: string[]; unanime?: boolean; resultado?: string; verificacao?: { ok: boolean; metodo: string; favor: number; contra: number; abstencao: number }; mostrarConta?: boolean; nomes?: Record<string, string> }
export declare function Votacao(props: VotacaoProps): React.ReactElement;
export interface Definicao { termo: string; definicao: string[]; apoio?: string[]; fonte?: { rota?: string; url?: string; texto: string } }
export interface TermoProps { id: string; texto: string; def: Definicao; onAbrirFolha?: (id: string, botao: HTMLButtonElement) => void }
export declare function Termo(props: TermoProps): React.ReactElement;
export interface TermoConteudoProps { id: string; def: Definicao; bloco?: boolean; semGlossario?: boolean }
export declare function TermoConteudo(props: TermoConteudoProps): React.ReactElement;
export interface CitationProps { text: string; permalink?: string }
export declare function Citation(props: CitationProps): React.ReactElement;
export interface SourceNoteProps { children?: React.ReactNode; source?: { href: string; label: string }; updated?: string; verification?: Status; tone?: 'aviso' }
export declare function SourceNote(props: SourceNoteProps): React.ReactElement;
declare global { interface Window { Redacao: { Button: typeof Button; StatusPill: typeof StatusPill; ActChip: typeof ActChip; Redline: typeof Redline; TextOrigin: typeof TextOrigin; VersionBar: typeof VersionBar; DateLens: typeof DateLens; VersionTimeline: typeof VersionTimeline; ProcessTrack: typeof ProcessTrack; VoteBar: typeof VoteBar; Votacao: typeof Votacao; Termo: typeof Termo; TermoConteudo: typeof TermoConteudo; Citation: typeof Citation; SourceNote: typeof SourceNote; dataPorExtenso(iso: string): string } } }
