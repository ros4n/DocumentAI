/**
 * Single icon surface for the app. Everything pulls from Phosphor at one
 * weight; swapping the set later means editing only this file. Default
 * size/weight come from <IconProvider> (mounted at the app root).
 */
import { IconContext } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

export {
  House,
  Images,
  ClockCounterClockwise,
  User,
  Gear,
  Camera,
  Image,
  FilePdf,
  TextAa,
  PencilSimple,
  Check,
  ArrowsClockwise,
  X,
  Crop,
  DownloadSimple,
  ShareNetwork,
  ArrowCounterClockwise,
  Eye,
  EyeSlash,
  Envelope,
  Lock,
  Warning,
  MagnifyingGlass,
  Trash,
  CaretRight,
  Plus,
  SignOut,
  CheckCircle,
  MapPin,
  Briefcase,
  IdentificationCard,
  ArrowsOutSimple,
  Minus,
  SpinnerGap,
  Sparkle,
  CursorClick,
  BoundingBox,
} from '@phosphor-icons/react'

export function IconProvider({ children }: { children: ReactNode }) {
  return (
    <IconContext.Provider value={{ size: 20, weight: 'regular', mirrored: false }}>
      {children}
    </IconContext.Provider>
  )
}
