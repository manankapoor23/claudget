// claudget-notch: the "Notch line" helper for claudget on notched MacBooks.
//
// An orange line traces the outside of the camera notch; its length is the
// Claude Code 5-hour limit. A short comet travels along the filled part, run
// entirely by Core Animation (the render server), so this process does no
// per-frame work. Hovering the notch drops a small card below it; clicking
// the card asks claudget to open its popover.
//
// Protocol (newline-delimited JSON):
//   stdin  ← {"fiveHour":{"pct":62,"estimated":true,"tone":"ok","resetsAt":<ms>},
//             "weekly":{"pct":31,"estimated":false},"fullAt":<ms>|null,"reducedMotion":null}
//            "fiveHour": null hides everything.
//   stdout → {"event":"ready"} {"event":"notch",...} {"event":"no-notch"} {"event":"open"}
//
// The helper exits as soon as stdin closes, so it can never outlive claudget.
//
// Flags: --probe (print notch info, exit), --render-test <dir> (offscreen PNGs),
//        --version.

import AppKit
import QuartzCore

let helperVersion = "1"

// MARK: - Protocol

struct LimitIn: Decodable, Equatable {
    let pct: Double
    let estimated: Bool?
    let tone: String?
    let resetsAt: Double?
}

struct StateIn: Decodable, Equatable {
    let fiveHour: LimitIn?
    let weekly: LimitIn?
    let fullAt: Double?
    let reducedMotion: Bool?
}

enum Out {
    static func emit(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]) else {
            return
        }
        FileHandle.standardOutput.write(data + Data([0x0A]))
    }
}

// MARK: - Look

enum Tone: String {
    case ok, warn, bad

    /// Brand orange, amber, red — the pill and popover's ok / warn / bad.
    var color: NSColor {
        switch self {
        case .ok: return NSColor(srgbRed: 1.0, green: 0x6B / 255, blue: 0x1F / 255, alpha: 1)
        case .warn: return NSColor(srgbRed: 1.0, green: 0xB2 / 255, blue: 0x24 / 255, alpha: 1)
        case .bad: return NSColor(srgbRed: 1.0, green: 0x45 / 255, blue: 0x3A / 255, alpha: 1)
        }
    }
}

func mix(_ a: NSColor, _ b: NSColor, _ t: CGFloat) -> NSColor {
    let x = a.usingColorSpace(.sRGB)!, y = b.usingColorSpace(.sRGB)!
    return NSColor(
        srgbRed: x.redComponent + (y.redComponent - x.redComponent) * t,
        green: x.greenComponent + (y.greenComponent - x.greenComponent) * t,
        blue: x.blueComponent + (y.blueComponent - x.blueComponent) * t,
        alpha: 1)
}

enum Metrics {
    /// The stroke, in points.
    static let lineWidth: CGFloat = 2.5
    /// Approximate radius of the notch's bottom corners in hardware.
    static let notchCornerRadius: CGFloat = 8
    /// The small outward curve where the line meets the top edge of the screen.
    static let flare: CGFloat = 4
    /// Gap between the hardware edge and the inner edge of the stroke.
    static let gap: CGFloat = 0.75
    /// Room around the notch the line window needs (the window ignores the mouse).
    static var marginX: CGFloat { lineWidth + gap + flare + 2 }
    static var marginY: CGFloat { lineWidth + gap + 2 }
}

// MARK: - Notch geometry

struct Notch: Equatable {
    /// The cutout, in global screen coordinates (y up).
    let rect: NSRect
    let screenFrame: NSRect
    /// Bottom of the menu bar on that screen.
    let menuBarBottom: CGFloat
    let scale: CGFloat
    let builtin: Bool
    let name: String
}

func findNotch() -> Notch? {
    var found: [Notch] = []
    for s in NSScreen.screens {
        guard s.safeAreaInsets.top > 0,
              let l0 = s.auxiliaryTopLeftArea,
              let r0 = s.auxiliaryTopRightArea
        else { continue }
        let f = s.frame
        // The auxiliary areas have been reported relative to the screen; accept
        // either convention by checking where the left area starts.
        let dx = abs(l0.minX - f.minX) < 1 ? 0 : f.minX
        let dy = abs(l0.maxY - f.maxY) < 1 ? 0 : f.minY
        let l = l0.offsetBy(dx: dx, dy: dy)
        let r = r0.offsetBy(dx: dx, dy: dy)
        let h = s.safeAreaInsets.top
        let w = r.minX - l.maxX
        guard w > 40, w < f.width / 2, h > 10, h < 80 else { continue }
        let id = s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID ?? 0
        found.append(Notch(
            rect: NSRect(x: l.maxX, y: f.maxY - h, width: w, height: h),
            screenFrame: f,
            menuBarBottom: min(f.maxY - h, s.visibleFrame.maxY),
            scale: s.backingScaleFactor,
            builtin: CGDisplayIsBuiltin(id) != 0,
            name: s.localizedName))
    }
    return found.first(where: { $0.builtin }) ?? found.first
}

func notchInfo(_ n: Notch?) -> [String: Any] {
    guard let n = n else { return ["event": "no-notch", "notch": false] }
    return [
        "event": "notch", "notch": true,
        "width": n.rect.width, "height": n.rect.height,
        "x": n.rect.minX, "y": n.rect.minY,
        "scale": n.scale, "builtin": n.builtin, "screen": n.name,
    ]
}

// MARK: - The outline path

/// The notch's outline, offset outward so the whole stroke sits on lit pixels:
/// in from the top edge with a small flare, down the left side, round the
/// bottom corners, across, and up the right side.
struct Outline {
    enum Seg {
        case line(CGPoint, CGPoint)
        case arc(center: CGPoint, radius: CGFloat, from: CGFloat, to: CGFloat, clockwise: Bool)

        var length: CGFloat {
            switch self {
            case let .line(a, b): return hypot(b.x - a.x, b.y - a.y)
            case let .arc(_, r, a0, a1, _): return r * abs(a1 - a0)
            }
        }
    }

    let segs: [Seg]
    let length: CGFloat
    let path: CGPath

    /// `notch` is the cutout in the view's coordinates (y up); `top` is the
    /// screen's top edge in the same coordinates.
    init(notch r: CGRect, top: CGFloat) {
        let d = Metrics.lineWidth / 2 + Metrics.gap
        let f = Metrics.flare
        let x0 = r.minX - d, x1 = r.maxX + d
        let yBot = r.minY - d
        let rad = min(Metrics.notchCornerRadius + d, (x1 - x0) / 2, (top - yBot) / 2)
        let half = CGFloat.pi / 2
        segs = [
            .arc(center: CGPoint(x: x0 - f, y: top - f), radius: f, from: half, to: 0, clockwise: true),
            .line(CGPoint(x: x0, y: top - f), CGPoint(x: x0, y: yBot + rad)),
            .arc(center: CGPoint(x: x0 + rad, y: yBot + rad), radius: rad, from: .pi, to: 3 * half, clockwise: false),
            .line(CGPoint(x: x0 + rad, y: yBot), CGPoint(x: x1 - rad, y: yBot)),
            .arc(center: CGPoint(x: x1 - rad, y: yBot + rad), radius: rad, from: 3 * half, to: 2 * .pi, clockwise: false),
            .line(CGPoint(x: x1, y: yBot + rad), CGPoint(x: x1, y: top - f)),
            .arc(center: CGPoint(x: x1 + f, y: top - f), radius: f, from: .pi, to: half, clockwise: true),
        ]
        length = segs.reduce(0) { $0 + $1.length }
        let p = CGMutablePath()
        p.move(to: CGPoint(x: x0 - f, y: top))
        for s in segs {
            switch s {
            case let .line(_, b): p.addLine(to: b)
            case let .arc(c, rr, a0, a1, cw):
                p.addArc(center: c, radius: rr, startAngle: a0, endAngle: a1, clockwise: cw)
            }
        }
        path = p.copy()!
    }

    var start: CGPoint {
        guard case let .arc(c, r, a0, _, _) = segs[0] else { return .zero }
        return CGPoint(x: c.x + r * cos(a0), y: c.y + r * sin(a0))
    }

    /// The point `s` points along the outline, and the direction of travel there.
    func point(at s: CGFloat) -> (CGPoint, CGFloat) {
        var left = min(max(s, 0), length)
        for (i, seg) in segs.enumerated() {
            let l = seg.length
            if left > l && i < segs.count - 1 { left -= l; continue }
            let u = l > 0 ? min(left / l, 1) : 0
            switch seg {
            case let .line(a, b):
                return (CGPoint(x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u), atan2(b.y - a.y, b.x - a.x))
            case let .arc(c, r, a0, a1, _):
                let ang = a0 + (a1 - a0) * u
                let dir = ang + (a1 > a0 ? CGFloat.pi / 2 : -CGFloat.pi / 2)
                return (CGPoint(x: c.x + r * cos(ang), y: c.y + r * sin(ang)), dir)
            }
        }
        return (start, 0)
    }

    /// The outline from its start to `s` points along it.
    func path(upTo s: CGFloat) -> CGPath {
        let p = CGMutablePath()
        p.move(to: start)
        var left = min(max(s, 0), length)
        for seg in segs where left > 0 {
            let l = seg.length
            let u = l > 0 ? min(left / l, 1) : 1
            switch seg {
            case let .line(a, b):
                p.addLine(to: CGPoint(x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u))
            case let .arc(c, r, a0, a1, cw):
                p.addArc(center: c, radius: r, startAngle: a0, endAngle: a0 + (a1 - a0) * u, clockwise: cw)
            }
            left -= l
        }
        return p.copy()!
    }
}

// MARK: - The comet's timing

/// Cubic-bezier easing, the same curve as CAMediaTimingFunction(.easeInEaseOut),
/// so the offscreen renders show exactly the frames Core Animation draws.
func easeInOut(_ x: Double) -> Double {
    let x = min(max(x, 0), 1)
    let p1 = 0.42, p2 = 0.58
    func bez(_ t: Double, _ a: Double, _ b: Double) -> Double {
        let u = 1 - t
        return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
    }
    var lo = 0.0, hi = 1.0, t = x
    for _ in 0..<30 {
        t = (lo + hi) / 2
        if bez(t, p1, p2) < x { lo = t } else { hi = t }
    }
    return bez(t, 0, 1)
}

/// One run of the comet: its head eases from the start of the line to the end
/// of the filled part, then it fades out into the end and rests.
struct CometPlan: Equatable {
    /// Fraction of the outline the comet runs over (the fill, or all of it at 0%).
    let span: CGFloat
    /// Seconds the head takes to cross the span.
    let travel: Double
    /// Seconds it takes to fade out at the end.
    let fadeOut: Double
    /// Length of the comet's tail, in points.
    let tail: CGFloat
    let rest: Double
    let glint: Bool

    /// Seconds anything is moving.
    var active: Double { travel + fadeOut }

    static func make(pct: CGFloat, outlineLength len: CGFloat) -> CometPlan {
        let glint = pct <= 0
        let span = glint ? 1 : min(max(pct, 0), 1)
        let speed: CGFloat = glint ? 55 : 85 // points per second
        let travel = Double(min(max(span * len / speed, 0.9), glint ? 4.8 : 3.0))
        return CometPlan(span: span, travel: travel, fadeOut: 0.35,
                         tail: glint ? 18 : min(48, max(16, span * len * 0.5)),
                         rest: glint ? 2.6 : 2.2, glint: glint)
    }

    /// How far along the outline the head is, as a fraction of the outline.
    func head(at t: Double) -> CGFloat { CGFloat(easeInOut(t / travel)) * span }

    func opacity(at t: Double) -> CGFloat {
        if t < 0.15 { return CGFloat(t / 0.15) }
        if t <= travel { return 1 }
        if t < active { return CGFloat(1 - easeInOut((t - travel) / fadeOut)) }
        return 0
    }
}

/// The comet's mask: transparent at the tail, opaque at the head, a soft tip.
/// Moving it is pure compositing, so the render server never re-rasterises
/// the line while it travels.
func cometSprite(length: CGFloat, height: CGFloat, scale: CGFloat) -> CGImage {
    let w = Int(ceil(length * scale)), h = Int(ceil(height * scale))
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue)!
    let tipStart = 1 - min(0.18, 4 / length)
    let g = CGGradient(colorsSpace: nil,
                       colors: [CGColor(gray: 0, alpha: 0), CGColor(gray: 0, alpha: 0.25),
                                CGColor(gray: 0, alpha: 1), CGColor(gray: 0, alpha: 0)] as CFArray,
                       locations: [0, 0.45, tipStart, 1])!
    ctx.drawLinearGradient(g, start: .zero, end: CGPoint(x: w, y: 0), options: [])
    return ctx.makeImage()!
}

// MARK: - The line

struct LineModel: Equatable {
    var pct: CGFloat // 0...1
    var tone: Tone
    var estimated: Bool
}

final class NotchLineView: NSView {
    private let track = CAShapeLayer()
    private let base = CAShapeLayer()
    /// A bright copy of the filled line, seen only through the moving sprite.
    private let bright = CAShapeLayer()
    private let maskHost = CALayer()
    private let sprite = CALayer()

    private(set) var outline: Outline?
    private(set) var model: LineModel?
    private(set) var plan: CometPlan?
    private var scale: CGFloat = 2
    private var travelling = false
    /// The next run, queued for after the rest.
    private var nextRun: DispatchWorkItem?
    private var running = false
    /// Tags each run, so a cancelled run's completion can't end the next one.
    private var runID = 0

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = CALayer()
        layer!.masksToBounds = false
        for l in [track, base, bright] {
            l.fillColor = nil
            l.lineCap = .round
            l.lineJoin = .round
            l.lineWidth = Metrics.lineWidth
        }
        track.strokeEnd = 1
        base.strokeEnd = 0
        bright.opacity = 0
        sprite.anchorPoint = CGPoint(x: 1, y: 0.5)
        maskHost.addSublayer(sprite)
        bright.mask = maskHost
        layer!.addSublayer(track)
        layer!.addSublayer(base)
        layer!.addSublayer(bright)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// `notch` in this view's coordinates; the view's top is the screen's top.
    func setGeometry(notch: CGRect, scale: CGFloat) {
        let o = Outline(notch: notch, top: bounds.height)
        outline = o
        self.scale = scale
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for l in [layer!, track, base, bright, maskHost] {
            l.contentsScale = scale
            l.frame = bounds
        }
        sprite.contentsScale = scale
        for l in [track, base, bright] { l.path = o.path }
        CATransaction.commit()
        if let m = model { model = nil; plan = nil; set(m, animated: false) }
    }

    func set(_ m: LineModel, animated: Bool) {
        guard let o = outline else { model = m; return }
        model = m
        let color = m.tone.color
        CATransaction.begin()
        CATransaction.setAnimationDuration(animated ? 0.6 : 0)
        CATransaction.setAnimationTimingFunction(CAMediaTimingFunction(name: .easeInEaseOut))
        CATransaction.setDisableActions(!animated)
        base.strokeEnd = m.pct
        base.strokeColor = color.cgColor
        base.opacity = m.estimated ? 0.72 : 1
        track.strokeColor = color.withAlphaComponent(m.pct > 0 ? 0.14 : 0.12).cgColor
        CATransaction.commit()

        let newPlan = CometPlan.make(pct: m.pct, outlineLength: o.length)
        guard newPlan != plan else { return }
        plan = newPlan
        // A run in flight finishes as it began; the next one uses the new plan.
        if travelling && !running && nextRun == nil { runComet() }
    }

    /// Bright line, sprite and colour for a plan; set between runs only.
    private func prepare(_ plan: CometPlan, _ m: LineModel) {
        guard let o = outline else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        bright.strokeEnd = plan.span
        bright.strokeColor = mix(m.tone.color, .white, plan.glint ? 0.3 : 0.62)
            .withAlphaComponent(plan.glint ? 0.6 : 1).cgColor
        let h: CGFloat = 14
        sprite.bounds = CGRect(x: 0, y: 0, width: plan.tail, height: h)
        sprite.contents = cometSprite(length: plan.tail, height: h, scale: scale)
        let (p, a) = o.point(at: 0)
        sprite.position = p
        sprite.setAffineTransform(CGAffineTransform(rotationAngle: a))
        CATransaction.commit()
    }

    func setTravelling(_ on: Bool) {
        guard on != travelling else { return }
        travelling = on
        if on { runComet() } else { stopComet() }
    }

    private func stopComet() {
        nextRun?.cancel()
        nextRun = nil
        running = false
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        bright.removeAllAnimations()
        sprite.removeAllAnimations()
        bright.opacity = 0
        CATransaction.commit()
    }

    private func runComet() {
        nextRun?.cancel()
        nextRun = nil
        guard travelling, let plan = plan, let m = model, let o = outline else { return }
        prepare(plan, m)
        running = true
        runID += 1
        let id = runID
        let ease = CAMediaTimingFunction(name: .easeInEaseOut)
        let lin = CAMediaTimingFunction(name: .linear)

        // The head follows the filled part of the outline, turning with it.
        let move = CAKeyframeAnimation(keyPath: "position")
        move.path = o.path(upTo: plan.span * o.length)
        move.calculationMode = .paced
        move.rotationMode = .rotateAuto
        move.duration = plan.travel
        move.timingFunction = ease
        move.fillMode = .forwards
        move.isRemovedOnCompletion = false

        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = [0, 1, 1, 0]
        fade.keyTimes = [0, NSNumber(value: 0.15 / plan.active), NSNumber(value: plan.travel / plan.active), 1]
        fade.timingFunctions = [lin, lin, ease]
        fade.duration = plan.active
        fade.fillMode = .forwards
        fade.isRemovedOnCompletion = false

        if #available(macOS 12.0, *) {
            let r = CAFrameRateRange(minimum: 24, maximum: 30, preferred: 30)
            move.preferredFrameRateRange = r
            fade.preferredFrameRateRange = r
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        CATransaction.setCompletionBlock { [weak self] in self?.finishedRun(plan, id) }
        sprite.add(move, forKey: "move")
        bright.add(fade, forKey: "fade")
        CATransaction.commit()
    }

    /// One wake-up per run: clear the finished animations, wait out the rest.
    private func finishedRun(_ plan: CometPlan, _ id: Int) {
        guard running, id == runID else { return }
        running = false
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        bright.opacity = 0
        bright.removeAllAnimations()
        sprite.removeAllAnimations()
        CATransaction.commit()
        guard travelling else { return }
        let w = DispatchWorkItem { [weak self] in self?.runComet() }
        nextRun = w
        DispatchQueue.main.asyncAfter(deadline: .now() + plan.rest, execute: w)
    }

    /// For the offscreen renders: pose the comet as it is `t` seconds into a
    /// run, as model values (layer.render(in:) ignores running animations).
    func pose(at t: Double?) {
        guard let plan = plan, let m = model, let o = outline else { return }
        stopComet()
        guard let t = t else { return }
        prepare(plan, m)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let (p, a) = o.point(at: plan.head(at: t) * o.length)
        sprite.position = p
        sprite.setAffineTransform(CGAffineTransform(rotationAngle: a))
        bright.opacity = Float(plan.opacity(at: t))
        CATransaction.commit()
    }
}

// MARK: - The hover card

func shortDuration(_ ms: Double) -> String {
    if ms <= 0 { return "0m" }
    let s = Int(ms / 1000)
    let d = s / 86400, h = (s % 86400) / 3600, m = (s % 3600) / 60
    if d > 0 { return "\(d)d \(h)h" }
    if h > 0 { return "\(h)h \(m)m" }
    if m > 0 { return "\(m)m" }
    return "\(s)s"
}

let clockFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateStyle = .none
    f.timeStyle = .short
    return f
}()

final class NotchCardView: NSView {
    static let size = NSSize(width: 248, height: 112)
    var state: StateIn? { didSet { needsDisplay = true } }
    var now: () -> Double = { Date().timeIntervalSince1970 * 1000 }
    var onClick: (() -> Void)?
    var onHover: ((Bool) -> Void)?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) { fatalError() }

    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for t in trackingAreas { removeTrackingArea(t) }
        addTrackingArea(NSTrackingArea(
            rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self, userInfo: nil))
    }

    override func mouseEntered(with event: NSEvent) { onHover?(true) }
    override func mouseExited(with event: NSEvent) { onHover?(false) }

    private func text(_ s: String, _ size: CGFloat, _ weight: NSFont.Weight, _ color: NSColor, mono: Bool = false) -> NSAttributedString {
        let font = mono ? NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
            : NSFont.systemFont(ofSize: size, weight: weight)
        return NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .kern: size >= 15 ? -0.2 : 0])
    }

    private func pct(_ l: LimitIn) -> NSAttributedString {
        let s = NSMutableAttributedString()
        if l.estimated == true { s.append(text("~", 15, .regular, NSColor(white: 1, alpha: 0.45), mono: true)) }
        s.append(text("\(Int(l.pct.rounded()))%", 15, .semibold, NSColor(white: 1, alpha: 0.95), mono: true))
        return s
    }

    override func draw(_ dirtyRect: NSRect) {
        let b = bounds
        // The card: black like the notch, a hairline edge for dark wallpapers.
        let shape = NSBezierPath(roundedRect: b.insetBy(dx: 0.5, dy: 0.5), xRadius: 16, yRadius: 16)
        NSColor.black.setFill()
        shape.fill()
        NSColor(white: 1, alpha: 0.09).setStroke()
        shape.lineWidth = 1
        shape.stroke()

        guard let st = state, let five = st.fiveHour else { return }
        let pad: CGFloat = 16
        let w = b.width - pad * 2
        let tone = Tone(rawValue: five.tone ?? "ok") ?? .ok
        let label = NSColor(white: 1, alpha: 0.55)
        let quiet = NSColor(white: 1, alpha: 0.42)

        func right(_ s: NSAttributedString, y: CGFloat) {
            s.draw(at: NSPoint(x: b.width - pad - s.size().width, y: y))
        }

        // 5-hour
        let p5 = pct(five)
        let top: CGFloat = 13
        let lbl = text("5-hour", 12, .medium, label)
        lbl.draw(at: NSPoint(x: pad, y: top + (p5.size().height - lbl.size().height) / 2 + 1))
        right(p5, y: top)

        // The bar, in the line's colour.
        let barY = top + p5.size().height + 5
        let track = NSBezierPath(roundedRect: NSRect(x: pad, y: barY, width: w, height: 4), xRadius: 2, yRadius: 2)
        NSColor(white: 1, alpha: 0.1).setFill()
        track.fill()
        let fillW = max(0, min(1, five.pct / 100)) * w
        if fillW > 0 {
            let fill = NSBezierPath(roundedRect: NSRect(x: pad, y: barY, width: max(fillW, 4), height: 4), xRadius: 2, yRadius: 2)
            tone.color.withAlphaComponent(five.estimated == true ? 0.75 : 1).setFill()
            fill.fill()
        }

        // Resets in … / Full by …
        let metaY = barY + 4 + 7
        if let r = five.resetsAt {
            text("Resets in \(shortDuration(r - now()))", 11, .regular, quiet, mono: true).draw(at: NSPoint(x: pad, y: metaY))
        } else {
            text("No reset scheduled", 11, .regular, quiet).draw(at: NSPoint(x: pad, y: metaY))
        }
        if let full = st.fullAt {
            let s = text("Full by \(clockFormatter.string(from: Date(timeIntervalSince1970: full / 1000)))", 11, .medium,
                         (tone == .ok ? Tone.warn : tone).color.withAlphaComponent(0.9), mono: true)
            right(s, y: metaY)
        }

        // Hairline, then weekly.
        let ruleY = metaY + 14 + 10
        NSColor(white: 1, alpha: 0.08).setFill()
        NSRect(x: pad, y: ruleY, width: w, height: 1 / max(1, window?.backingScaleFactor ?? 2)).fill()
        let wy = ruleY + 9
        let wl = text("Weekly", 12, .medium, label)
        wl.draw(at: NSPoint(x: pad, y: wy))
        if let wk = st.weekly {
            let s = NSMutableAttributedString()
            if wk.estimated == true { s.append(text("~", 12, .regular, quiet, mono: true)) }
            s.append(text("\(Int(wk.pct.rounded()))%", 12, .medium, NSColor(white: 1, alpha: 0.85), mono: true))
            right(s, y: wy)
        } else {
            right(text("—", 12, .medium, quiet), y: wy)
        }

        let est = five.estimated == true ? "about " : ""
        setAccessibilityLabel("Claude Code 5-hour limit \(est)\(Int(five.pct.rounded())) percent used. Open claudget.")
    }
}

// MARK: - Windows

/// A borderless panel that never becomes key or main and never activates the app.
final class OverlayPanel: NSPanel {
    init(level: NSWindow.Level) {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 10, height: 10),
                   styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered, defer: true)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = true
        isReleasedWhenClosed = false
        isExcludedFromWindowsMenu = true
        animationBehavior = .none
        isMovable = false
        // Last: isFloatingPanel and friends reset the level. Above the menu
        // bar (24), so the line is drawn over it, and over full-screen apps.
        self.level = level
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
    // The notch sits over the menu bar, where AppKit would normally refuse to put a window.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

/// Exactly the notch cutout: no pixels and no menu-bar items live there, so
/// catching the mouse here can never take a click from anything else.
final class HotZoneView: NSView {
    var onHover: ((Bool) -> Void)?
    var onClick: (() -> Void)?

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) { onClick?() }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for t in trackingAreas { removeTrackingArea(t) }
        addTrackingArea(NSTrackingArea(
            rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self, userInfo: nil))
    }

    override func mouseEntered(with event: NSEvent) { onHover?(true) }
    override func mouseExited(with event: NSEvent) { onHover?(false) }
}

// MARK: - Controller

final class Controller: NSObject {
    let lineWindow = OverlayPanel(level: NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1))
    let zoneWindow = OverlayPanel(level: .statusBar)
    let cardWindow = OverlayPanel(level: .statusBar)
    let lineView = NotchLineView(frame: .zero)
    let zoneView = HotZoneView(frame: .zero)
    let cardView = NotchCardView(frame: NSRect(origin: .zero, size: NotchCardView.size))

    var notch: Notch?
    var state: StateIn?
    var inZone = false, inCard = false
    var cardShown = false
    var hideWork: DispatchWorkItem?
    var screenWork: DispatchWorkItem?
    var cardTimer: Timer?
    var screensAsleep = false
    var lastNotchReport: [String: Any]?

    override init() {
        super.init()
        lineWindow.ignoresMouseEvents = true
        lineWindow.contentView = lineView
        zoneWindow.ignoresMouseEvents = false
        zoneWindow.contentView = zoneView
        cardWindow.ignoresMouseEvents = false
        cardWindow.contentView = cardView
        cardWindow.setAccessibilityElement(false)

        zoneView.onHover = { [weak self] in self?.inZone = $0; self?.hoverChanged() }
        cardView.onHover = { [weak self] in self?.inCard = $0; self?.hoverChanged() }
        zoneView.onClick = { [weak self] in self?.open() }
        cardView.onClick = { [weak self] in self?.open() }

        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(screensChanged),
                       name: NSApplication.didChangeScreenParametersNotification, object: nil)
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(self, selector: #selector(motionChanged),
                       name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
        ws.addObserver(self, selector: #selector(screensSlept),
                       name: NSWorkspace.screensDidSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(screensWoke),
                       name: NSWorkspace.screensDidWakeNotification, object: nil)
        nc.addObserver(self, selector: #selector(occlusionChanged),
                       name: NSWindow.didChangeOcclusionStateNotification, object: lineWindow)

        notch = findNotch()
        report()
        layout()
    }

    func report() {
        let info = notchInfo(notch)
        if let last = lastNotchReport, NSDictionary(dictionary: last).isEqual(to: info) { return }
        lastNotchReport = info
        Out.emit(info)
    }

    var reduceMotion: Bool {
        state?.reducedMotion ?? NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    var shouldTravel: Bool {
        guard !reduceMotion, !screensAsleep, lineWindow.isVisible else { return false }
        return lineWindow.occlusionState.contains(.visible)
    }

    func apply(_ s: StateIn) {
        let first = state == nil
        state = s
        Out.emit(["event": "applied", "pct": s.fiveHour?.pct ?? NSNull(), "shown": s.fiveHour != nil && notch != nil])
        guard let five = s.fiveHour, notch != nil else { return hideAll() }
        let m = LineModel(pct: CGFloat(max(0, min(100, five.pct)) / 100),
                          tone: Tone(rawValue: five.tone ?? "ok") ?? .ok,
                          estimated: five.estimated == true)
        lineView.set(m, animated: !first && lineWindow.isVisible)
        cardView.state = s
        if !lineWindow.isVisible {
            lineWindow.orderFrontRegardless()
            zoneWindow.orderFrontRegardless()
        }
        syncTravel()
    }

    func hideAll() {
        hideCard(animated: false)
        lineWindow.orderOut(nil)
        zoneWindow.orderOut(nil)
        syncTravel()
    }

    func layout() {
        guard let n = notch else { return hideAll() }
        let mx = Metrics.marginX, my = Metrics.marginY
        let top = n.screenFrame.maxY
        let lineFrame = NSRect(x: n.rect.minX - mx, y: n.rect.minY - my,
                               width: n.rect.width + 2 * mx, height: top - n.rect.minY + my)
        lineWindow.setFrame(lineFrame, display: false)
        lineView.frame = NSRect(origin: .zero, size: lineFrame.size)
        lineView.setGeometry(notch: NSRect(x: mx, y: my, width: n.rect.width, height: n.rect.height),
                             scale: n.scale)
        // Just inside the cutout, so the edges never overlap a lit pixel.
        zoneWindow.setFrame(n.rect.insetBy(dx: 2, dy: 0).offsetBy(dx: 0, dy: 0), display: false)
        let size = NotchCardView.size
        let cardTop = n.menuBarBottom - 4
        cardWindow.setFrame(NSRect(x: n.rect.midX - size.width / 2, y: cardTop - size.height,
                                   width: size.width, height: size.height), display: false)
        if let s = state { apply(s) }
    }

    var reportedTravel: Bool?
    func syncTravel() {
        let on = shouldTravel
        lineView.setTravelling(on)
        if on != reportedTravel {
            reportedTravel = on
            Out.emit(["event": "travel", "on": on, "reduceMotion": reduceMotion])
        }
    }

    // Hover: the card shows while the pointer is on the notch or the card.
    func hoverChanged() {
        hideWork?.cancel()
        if inZone || inCard {
            showCard()
        } else {
            let w = DispatchWorkItem { [weak self] in self?.hideCard(animated: true) }
            hideWork = w
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: w)
        }
    }

    func showCard() {
        guard !cardShown, state?.fiveHour != nil, notch != nil else { return }
        cardShown = true
        cardView.needsDisplay = true
        cardWindow.alphaValue = 1
        let l = cardView.layer!
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        l.opacity = 0
        CATransaction.commit()
        cardWindow.orderFrontRegardless()
        lineWindow.orderFrontRegardless()
        let drop = CASpringAnimation(keyPath: "transform.translation.y")
        drop.fromValue = 10
        drop.toValue = 0
        drop.damping = 22
        drop.stiffness = 300
        drop.mass = 1
        drop.duration = drop.settlingDuration
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.toValue = 1
        fade.duration = 0.18
        l.opacity = 1
        l.add(drop, forKey: "drop")
        l.add(fade, forKey: "fade")
        cardTimer?.invalidate()
        cardTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            self?.cardView.needsDisplay = true
        }
    }

    func hideCard(animated: Bool) {
        cardTimer?.invalidate()
        cardTimer = nil
        guard cardShown else { return }
        cardShown = false
        inCard = false
        if !animated { cardWindow.orderOut(nil); return }
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.14
            cardWindow.animator().alphaValue = 0
        }, completionHandler: { [weak self] in
            guard let self = self, !self.cardShown else { return }
            self.cardWindow.orderOut(nil)
        })
    }

    func open() {
        Out.emit(["event": "open"])
        hideWork?.cancel()
        inZone = false
        hideCard(animated: true)
    }

    @objc func screensChanged() {
        // Lid, displays and scaling arrive as a burst; settle first.
        screenWork?.cancel()
        let w = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            let n = findNotch()
            if n != self.notch {
                self.notch = n
                self.layout()
            }
            self.report()
            self.syncTravel()
        }
        screenWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: w)
    }

    @objc func motionChanged() { syncTravel() }
    @objc func screensSlept() { screensAsleep = true; syncTravel() }
    @objc func screensWoke() { screensAsleep = false; syncTravel() }
    @objc func occlusionChanged() { syncTravel() }
}

// MARK: - stdin

func readInput(_ controller: Controller) {
    let t = Thread {
        let decoder = JSONDecoder()
        while let line = readLine(strippingNewline: true) {
            guard !line.isEmpty, let data = line.data(using: .utf8) else { continue }
            do {
                let s = try decoder.decode(StateIn.self, from: data)
                DispatchQueue.main.async { controller.apply(s) }
            } catch {
                Out.emit(["event": "error", "message": "bad input: \(error)"])
            }
        }
        // claudget closed our stdin, or died: never linger.
        exit(0)
    }
    t.stackSize = 1 << 20
    t.start()
}

// MARK: - Offscreen render test

enum RenderTest {
    struct Scene {
        let name: String
        let pct: Double
        let estimated: Bool
        let times: [Double?]
        let light: Bool
        let card: Bool
    }

    static func toneFor(_ pct: Double) -> Tone { pct >= 90 ? .bad : pct >= 70 ? .warn : .ok }

    static func run(dir: String) {
        let fm = FileManager.default
        try? fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
        // This Mac's notch when there is one; otherwise a 14" MacBook Pro's.
        let real = findNotch()
        let notchSize = real?.rect.size ?? NSSize(width: 185, height: 32)
        let menuBar = real.map { $0.screenFrame.maxY - $0.menuBarBottom } ?? 33
        var scenes: [Scene] = []
        for p in [0.0, 25, 62, 90, 100] {
            scenes.append(Scene(name: "line-\(Int(p))-dark", pct: p, estimated: false, times: [nil, 0, 0.5, 1.0], light: false, card: false))
        }
        scenes.append(Scene(name: "line-62-estimated-dark", pct: 62, estimated: true, times: [nil, 0.5], light: false, card: false))
        scenes.append(Scene(name: "line-62-light", pct: 62, estimated: false, times: [nil, 0.5], light: true, card: false))
        scenes.append(Scene(name: "line-90-light", pct: 90, estimated: false, times: [nil, 1.0], light: true, card: false))
        scenes.append(Scene(name: "line-0-light", pct: 0, estimated: false, times: [nil, 1.5], light: true, card: false))
        scenes.append(Scene(name: "hover-62-estimated", pct: 62, estimated: true, times: [0.5], light: false, card: true))
        scenes.append(Scene(name: "hover-90-light", pct: 90, estimated: false, times: [nil], light: true, card: true))

        var rows: [(String, CGImage)] = []
        for sc in scenes {
            for t in sc.times {
                let img = render(sc, t: t, notchSize: notchSize, menuBar: menuBar)
                let tag = t.map { String(format: "t%.1f", $0) } ?? "static"
                let path = "\(dir)/\(sc.name)-\(tag).png"
                write(img, to: path)
                rows.append(("\(sc.name) \(tag)", img))
                print(path)
            }
        }
        // One contact sheet of every frame, for a quick look.
        let sheet = contactSheet(rows)
        write(sheet, to: "\(dir)/contact-sheet.png")
        print("\(dir)/contact-sheet.png")
        // And a long, real-time strip of one loop at 62%, every 0.1s.
        var strip: [(String, CGImage)] = []
        let sc = Scene(name: "loop", pct: 62, estimated: false, times: [], light: false, card: false)
        for i in 0..<36 {
            let t = Double(i) * 0.1
            strip.append((String(format: "t=%.1fs", t), render(sc, t: t, notchSize: notchSize, menuBar: menuBar)))
        }
        write(contactSheet(strip, columns: 6), to: "\(dir)/loop-62.png")
        print("\(dir)/loop-62.png")
    }

    static func render(_ sc: Scene, t: Double?, notchSize: NSSize, menuBar: CGFloat) -> CGImage {
        let scale: CGFloat = 2
        let W: CGFloat = max(notchSize.width + 240, NotchCardView.size.width + 80)
        let H: CGFloat = sc.card ? menuBar + NotchCardView.size.height + 20 : menuBar + 40
        let ctx = CGContext(data: nil, width: Int(W * scale), height: Int(H * scale), bitsPerComponent: 8,
                            bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.scaleBy(x: scale, y: scale)
        // Desktop, menu bar, and the hardware notch.
        let desk = sc.light ? NSColor(srgbRed: 0.80, green: 0.84, blue: 0.90, alpha: 1)
            : NSColor(srgbRed: 0.10, green: 0.11, blue: 0.14, alpha: 1)
        ctx.setFillColor(desk.cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let bar = sc.light ? NSColor(srgbRed: 0.93, green: 0.93, blue: 0.94, alpha: 1)
            : NSColor(srgbRed: 0.16, green: 0.16, blue: 0.18, alpha: 1)
        ctx.setFillColor(bar.cgColor)
        ctx.fill(CGRect(x: 0, y: H - menuBar, width: W, height: menuBar))
        // A few menu-bar items, for scale.
        let ink = sc.light ? NSColor(white: 0, alpha: 0.85) : NSColor(white: 1, alpha: 0.9)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
        let items = NSAttributedString(string: "View   Window   Help", attributes: [.font: NSFont.systemFont(ofSize: 13, weight: .regular), .foregroundColor: ink])
        items.draw(at: NSPoint(x: 10, y: H - menuBar + (menuBar - items.size().height) / 2))
        let right = NSAttributedString(string: "~62% · 31%   ◐   Wed 4:01 PM", attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .regular), .foregroundColor: ink])
        right.draw(at: NSPoint(x: W - right.size().width - 10, y: H - menuBar + (menuBar - right.size().height) / 2))
        NSGraphicsContext.restoreGraphicsState()

        let notch = CGRect(x: (W - notchSize.width) / 2, y: H - notchSize.height, width: notchSize.width, height: notchSize.height)
        let hw = CGMutablePath()
        let r = Metrics.notchCornerRadius
        hw.move(to: CGPoint(x: notch.minX, y: H))
        hw.addLine(to: CGPoint(x: notch.minX, y: notch.minY + r))
        hw.addArc(center: CGPoint(x: notch.minX + r, y: notch.minY + r), radius: r, startAngle: .pi, endAngle: 1.5 * .pi, clockwise: false)
        hw.addLine(to: CGPoint(x: notch.maxX - r, y: notch.minY))
        hw.addArc(center: CGPoint(x: notch.maxX - r, y: notch.minY + r), radius: r, startAngle: 1.5 * .pi, endAngle: 2 * .pi, clockwise: false)
        hw.addLine(to: CGPoint(x: notch.maxX, y: H))
        hw.closeSubpath()

        // The card sits under the line, as live.
        if sc.card {
            let card = NotchCardView(frame: NSRect(origin: .zero, size: NotchCardView.size))
            card.state = StateIn(
                fiveHour: LimitIn(pct: sc.pct, estimated: sc.estimated, tone: toneFor(sc.pct).rawValue,
                                  resetsAt: Date().timeIntervalSince1970 * 1000 + 8_040_000),
                weekly: LimitIn(pct: 31, estimated: sc.estimated, tone: "ok", resetsAt: nil),
                fullAt: Date().timeIntervalSince1970 * 1000 + 5_400_000, reducedMotion: nil)
            let cardTop = H - menuBar - 4
            NSGraphicsContext.saveGraphicsState()
            let g = NSGraphicsContext(cgContext: ctx, flipped: false)
            NSGraphicsContext.current = g
            ctx.saveGState()
            // NotchCardView draws flipped; flip into place.
            ctx.translateBy(x: (W - NotchCardView.size.width) / 2, y: cardTop)
            ctx.scaleBy(x: 1, y: -1)
            NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
            card.draw(card.bounds)
            ctx.restoreGState()
            NSGraphicsContext.restoreGraphicsState()
        }

        ctx.setFillColor(NSColor.black.cgColor)
        ctx.addPath(hw)
        ctx.fillPath()

        // The line view, exactly as the live window lays it out.
        let mx = Metrics.marginX, my = Metrics.marginY
        let view = NotchLineView(frame: NSRect(x: 0, y: 0, width: notch.width + 2 * mx, height: notch.height + my))
        view.setGeometry(notch: NSRect(x: mx, y: my, width: notch.width, height: notch.height), scale: scale)
        view.set(LineModel(pct: CGFloat(sc.pct / 100), tone: toneFor(sc.pct), estimated: sc.estimated), animated: false)
        view.pose(at: t)
        ctx.saveGState()
        ctx.translateBy(x: notch.minX - mx, y: notch.minY - my)
        view.layer!.render(in: ctx)
        ctx.restoreGState()
        return ctx.makeImage()!
    }

    static func contactSheet(_ rows: [(String, CGImage)], columns: Int = 4) -> CGImage {
        let cw = rows.map { $0.1.width }.max()!, ch = rows.map { $0.1.height }.max()!
        let label = 36
        let n = rows.count, cols = min(columns, n), rcount = (n + cols - 1) / cols
        let W = cols * cw, H = rcount * (ch + label)
        let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.setFillColor(NSColor(white: 0.05, alpha: 1).cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
        for (i, (name, img)) in rows.enumerated() {
            let c = i % cols, r = i / cols
            let y = H - (r + 1) * (ch + label)
            ctx.draw(img, in: CGRect(x: c * cw, y: y + ch - img.height, width: img.width, height: img.height))
            NSAttributedString(string: name, attributes: [.font: NSFont.systemFont(ofSize: 20), .foregroundColor: NSColor(white: 1, alpha: 0.7)])
                .draw(at: NSPoint(x: c * cw + 10, y: y + ch + 6))
        }
        NSGraphicsContext.restoreGraphicsState()
        return ctx.makeImage()!
    }

    static func write(_ img: CGImage, to path: String) {
        let rep = NSBitmapImageRep(cgImage: img)
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    }
}

// MARK: - Main

let args = CommandLine.arguments
if args.contains("--version") {
    print(helperVersion)
    exit(0)
}
if args.contains("--probe") {
    _ = NSApplication.shared
    var info = notchInfo(findNotch())
    info.removeValue(forKey: "event")
    Out.emit(info)
    exit(0)
}
if let i = args.firstIndex(of: "--render-test") {
    _ = NSApplication.shared
    let dir = i + 1 < args.count ? args[i + 1] : "notch-render"
    RenderTest.run(dir: dir)
    exit(0)
}

signal(SIGPIPE, SIG_DFL)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = Controller()
readInput(controller)
Out.emit(["event": "ready", "version": helperVersion])
app.run()
