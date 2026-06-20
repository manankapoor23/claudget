# DESIGN.md

## Design Philosophy

Build a usage dashboard that feels like a physical ledger, notebook, or technical operations console rather than a modern SaaS application.

The interface should combine:

* Neo-Brutalism
* Editorial Design
* Printed Reports
* Vintage Computing Interfaces

The user should feel like they are reading a carefully organized document, not interacting with floating UI cards.

---

# Visual Identity

## Keywords

* Structured
* Mechanical
* Intentional
* Printed
* Technical
* Minimal
* Functional

Avoid:

* Glassmorphism
* Blur effects
* Floating cards
* Heavy shadows
* Modern SaaS gradients
* Excessive animations

---

# Color System

## Background

Primary Paper:
#EFE6D4

Secondary Paper:
#F4EBDC

Border Background:
#E9DDC8

---

## Accent Colors

Header Yellow:
#F4DD3E

Action Orange:
#FF6A2B

Text Black:
#111111

Muted Text:
#555555

Success:
#2E7D32

Warning:
#D97706

Danger:
#B91C1C

---

# Borders

Everything must be framed.

```css
border: 2px solid #111111;
border-radius: 0;
box-shadow: none;
```

No rounded corners.

No soft edges.

No floating containers.

Every section should feel physically boxed.

---

# Typography

## Primary Font

IBM Plex Mono

Fallback:

JetBrains Mono
Courier New
monospace

---

## Hierarchy

Page Title:
32px
700

Section Headers:
18px
600

Card Labels:
12px
500
uppercase

Metric Values:
36px
700

Secondary Metadata:
14px
400

---

# Layout System

Use strict editorial grids.

Example:

---

## | Sidebar | Header                              |

|         | Current Block                       |
|         |-------------------------------------|
|         | Metrics                             |
|         |-------------------------------------|
|         | Usage History                       |
-------------------------------------------------

No overlapping elements.

No floating widgets.

No random spacing.

Everything must align to a visible grid.

---

# Navigation

Left sidebar.

Fixed width:
80px

Icons:
24px

Labels:
10–12px

Active state:

* Orange icon
* Orange label
* Light paper background

Inactive state:

* Black icon
* Black label

---

# Header

Height:
72px

Background:
#F4DD3E

Contains:

* Search
* Block Selector
* User Profile
* Notifications

Must visually resemble a toolbar from a desktop application.

---

# Metric Cards

Cards are information boxes.

Example:

+----------------------+
| BLOCK TOKENS         |
|                      |
| 6.9M                 |
|                      |
| $17.10               |
+----------------------+

Requirements:

* Hard borders
* No shadows
* Large metrics
* Uppercase labels

---

# Progress Indicators

Avoid modern progress bars.

Use terminal-style indicators.

Example:

[████████░░░░░░░░]

or

Consumed: 27%

6.9M / 26M Tokens

Must communicate information first.

Decoration second.

---

# Buttons

Buttons should feel like physical controls.

Primary:

Background:
#FF6A2B

Text:
#111111

Border:
2px solid #111111

Hover:

Transform:
translate(-2px, -2px)

Secondary:

Paper background

Black border

Black text

---

# Tables

Use report-style tables.

No zebra gradients.

No shadows.

Only:

* Borders
* Typography
* Alignment

Think newspaper layout.

---

# Data Visualization

Charts should resemble engineering reports.

Requirements:

* Thin axes
* Minimal colors
* No glow
* No gradients
* No glass containers

Preferred:

* Line charts
* Bar charts
* Usage timelines

Avoid:

* Fancy 3D charts
* Overly colorful dashboards

---

# Spacing Scale

4px
8px
16px
24px
32px
48px

Do not use arbitrary spacing values.

---

# Animations

Very limited.

Allowed:

* Hover elevation via translation
* Button press states
* Smooth page transitions

Not allowed:

* Blur animations
* Floating motion
* Bouncing cards
* Excessive micro-interactions

---

# Dashboard Sections

1. Current Block

   * Reset Timer
   * Elapsed Time
   * Burn Rate

2. Usage Metrics

   * Tokens
   * Requests
   * Cost
   * Projected Usage

3. Historical Usage

   * Daily
   * Weekly
   * Monthly

4. Session Activity

   * Active Sessions
   * Average Burn Rate
   * Peak Usage

5. System Summary

   * Total Tokens
   * Total Cost
   * Lifetime Statistics

---

# Design Goal

The final interface should feel like:

* A premium engineering notebook
* A technical operations console
* A printed usage report
* A beautifully organized ledger

It should NOT feel like:

* Linear
* Stripe
* Vercel
* Modern glassmorphism dashboards
* Generic SaaS templates

Prioritize structure, readability, and permanence over visual effects.
