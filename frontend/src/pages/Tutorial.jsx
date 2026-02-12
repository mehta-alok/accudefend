import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield,
  Zap,
  FileText,
  Settings,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Check,
  Play,
  Rocket,
  FileCheck,
  Bell,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Upload,
  Send,
  Eye,
  Sliders,
  HelpCircle,
  BookOpen,
  Lightbulb,
  Target
} from 'lucide-react'

const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to AccuDefend',
    subtitle: 'AI-Powered Chargeback Defense',
    icon: Shield,
    color: 'primary',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          AccuDefend is your intelligent chargeback defense system that automatically manages disputes
          across multiple payment processors. Let's walk through how to get the most out of it.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="p-4 bg-primary-50 rounded-xl">
            <Zap className="w-8 h-8 text-primary-600 mb-2" />
            <h4 className="font-semibold text-slate-800">AI-Powered</h4>
            <p className="text-sm text-slate-600">Automatic evidence analysis and confidence scoring</p>
          </div>
          <div className="p-4 bg-green-50 rounded-xl">
            <Rocket className="w-8 h-8 text-green-600 mb-2" />
            <h4 className="font-semibold text-slate-800">Instant Response</h4>
            <p className="text-sm text-slate-600">Submit disputes in seconds, not hours</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-xl">
            <TrendingUp className="w-8 h-8 text-yellow-600 mb-2" />
            <h4 className="font-semibold text-slate-800">Higher Win Rates</h4>
            <p className="text-sm text-slate-600">Optimized evidence packages for better outcomes</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl">
            <Target className="w-8 h-8 text-purple-600 mb-2" />
            <h4 className="font-semibold text-slate-800">Multi-Processor</h4>
            <p className="text-sm text-slate-600">Works with Stripe, Adyen, Shift4, and more</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'dashboard',
    title: 'The Dashboard',
    subtitle: 'Your command center',
    icon: BarChart3,
    color: 'blue',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          The Dashboard gives you a real-time overview of your chargeback defense performance.
        </p>
        <div className="space-y-3 mt-6">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="p-2 bg-slate-200 rounded-lg">
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h4 className="font-medium text-slate-800">Stats Cards</h4>
              <p className="text-sm text-slate-600">View total cases, pending reviews, win rate, and recovered amounts at a glance</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h4 className="font-medium text-slate-800">Pending Alert</h4>
              <p className="text-sm text-slate-600">Quickly see how many cases need your attention</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="p-2 bg-green-100 rounded-lg">
              <Zap className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-slate-800">AI Status</h4>
              <p className="text-sm text-slate-600">Monitor your AI defense settings and performance metrics</p>
            </div>
          </div>
        </div>
        <div className="mt-4 p-4 bg-primary-50 rounded-xl border border-primary-200">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-5 h-5 text-primary-600" />
            <span className="font-medium text-primary-800">Pro Tip</span>
          </div>
          <p className="text-sm text-primary-700">
            Check the Dashboard daily to stay on top of pending cases. Cases with approaching deadlines are highlighted.
          </p>
        </div>
      </div>
    )
  },
  {
    id: 'cases',
    title: 'Managing Cases',
    subtitle: 'Track and submit disputes',
    icon: FileText,
    color: 'green',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          The Cases page is where you'll manage all your chargeback disputes. Here's how to use it effectively:
        </p>

        <div className="space-y-4 mt-6">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center">1</span>
            Case Statuses
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-8">
            <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-800">Pending</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <Send className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-800">Submitted</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800">Won</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-800">Lost</span>
            </div>
          </div>

          <h4 className="font-semibold text-slate-800 flex items-center gap-2 mt-6">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center">2</span>
            Confidence Scores
          </h4>
          <div className="ml-8 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-3">Each case shows an AI-calculated confidence score:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-20 h-2 bg-green-500 rounded-full" />
                <span className="text-sm text-slate-600">90%+ = Strong case, likely to win</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-20 h-2 bg-yellow-500 rounded-full" />
                <span className="text-sm text-slate-600">70-89% = Good case, review recommended</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-20 h-2 bg-red-500 rounded-full" />
                <span className="text-sm text-slate-600">Below 70% = Weak case, gather more evidence</span>
              </div>
            </div>
          </div>

          <h4 className="font-semibold text-slate-800 flex items-center gap-2 mt-6">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-sm flex items-center justify-center">3</span>
            Evidence Checklist
          </h4>
          <p className="text-sm text-slate-600 ml-8">
            Each case displays collected evidence. Green checkmarks indicate evidence is present;
            red alerts show missing evidence that could strengthen your case.
          </p>
        </div>
      </div>
    )
  },
  {
    id: 'evidence',
    title: 'Evidence Collection',
    subtitle: 'Build winning cases',
    icon: FileCheck,
    color: 'purple',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          Strong evidence is key to winning chargebacks. AccuDefend automatically collects and organizes evidence from your systems.
        </p>

        <h4 className="font-semibold text-slate-800 mt-6 mb-3">Types of Evidence</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: 'ID Scan', desc: 'Guest identification verification', importance: 'Critical' },
            { name: 'Authorization Signature', desc: 'Signed credit card authorization', importance: 'Critical' },
            { name: 'Checkout Signature', desc: 'Guest signature at departure', importance: 'Important' },
            { name: 'Folio/Invoice', desc: 'Detailed charge breakdown', importance: 'Critical' },
            { name: 'Key Card Logs', desc: 'Room access records', importance: 'Strong' },
            { name: 'CCTV Footage', desc: 'Video evidence of stay', importance: 'Strong' },
            { name: 'Correspondence', desc: 'Emails with guest', importance: 'Helpful' },
            { name: 'Booking Confirmation', desc: 'Original reservation', importance: 'Important' },
          ].map((ev, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <Check className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-slate-800">{ev.name}</p>
                <p className="text-xs text-slate-500">{ev.desc}</p>
                <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${
                  ev.importance === 'Critical' ? 'bg-red-100 text-red-700' :
                  ev.importance === 'Strong' ? 'bg-green-100 text-green-700' :
                  ev.importance === 'Important' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {ev.importance}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-800">Important</span>
          </div>
          <p className="text-sm text-yellow-700">
            The more evidence you have, the higher your confidence score and win rate.
            Make sure your PMS is properly integrated to auto-collect evidence.
          </p>
        </div>
      </div>
    )
  },
  {
    id: 'ai-settings',
    title: 'AI Configuration',
    subtitle: 'Customize automation',
    icon: Sliders,
    color: 'orange',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          Configure how AccuDefend's AI handles your cases in the Settings page.
        </p>

        <div className="space-y-4 mt-6">
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Zap className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Auto-Submit</h4>
                <p className="text-sm text-slate-500">Enable/disable automatic case submission</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              When enabled, cases that meet your criteria are automatically submitted to the payment processor.
            </p>
          </div>

          <div className="p-4 bg-green-50 rounded-xl border-2 border-green-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-green-800">Instant Auto-Submit</h4>
                <p className="text-sm text-green-600">Submit immediately when cases arrive</p>
              </div>
            </div>
            <p className="text-sm text-green-700">
              Enable this for the fastest response times. Cases are submitted the moment they arrive
              if they meet your confidence threshold and have all required evidence.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Target className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Confidence Threshold</h4>
                <p className="text-sm text-slate-500">Set the minimum confidence for auto-submit</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              We recommend 80% as a balance between automation and accuracy. Lower thresholds mean more
              automation but potentially weaker cases; higher thresholds are safer but require more manual review.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">Required Evidence</h4>
                <p className="text-sm text-slate-500">Specify what evidence must be present</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Select which evidence types are mandatory for auto-submission. Cases missing required
              evidence will be flagged for manual review.
            </p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'analytics',
    title: 'Analytics & Reports',
    subtitle: 'Track your performance',
    icon: TrendingUp,
    color: 'teal',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          The Analytics page provides insights into your chargeback defense performance over time.
        </p>

        <div className="space-y-3 mt-6">
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <BarChart3 className="w-6 h-6 text-primary-600 mt-1" />
            <div>
              <h4 className="font-medium text-slate-800">Monthly Trends</h4>
              <p className="text-sm text-slate-600">
                Track case volume, win rates, and recovered amounts over time.
                Identify seasonal patterns and measure improvement.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <Target className="w-6 h-6 text-green-600 mt-1" />
            <div>
              <h4 className="font-medium text-slate-800">Processor Performance</h4>
              <p className="text-sm text-slate-600">
                See win rates by payment processor. Understand which processors have
                better dispute resolution outcomes.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
            <FileText className="w-6 h-6 text-yellow-600 mt-1" />
            <div>
              <h4 className="font-medium text-slate-800">Reason Code Analysis</h4>
              <p className="text-sm text-slate-600">
                Breakdown of chargebacks by reason code. Helps identify common
                dispute reasons and where to focus prevention efforts.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-primary-50 rounded-xl border border-primary-200">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-5 h-5 text-primary-600" />
            <span className="font-medium text-primary-800">Pro Tip</span>
          </div>
          <p className="text-sm text-primary-700">
            Review analytics weekly to spot trends. A sudden increase in specific reason codes
            might indicate a process issue that needs attention.
          </p>
        </div>
      </div>
    )
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    subtitle: 'Maximize your win rate',
    icon: Target,
    color: 'green',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          Follow these best practices to get the most out of AccuDefend and maximize your chargeback win rate.
        </p>

        <div className="space-y-4 mt-6">
          {[
            {
              title: 'Collect evidence at check-in',
              desc: 'Scan IDs and get authorization signatures before the guest enters the room',
              icon: FileCheck
            },
            {
              title: 'Require checkout signatures',
              desc: 'Have guests sign the final folio at checkout to confirm all charges',
              icon: Check
            },
            {
              title: 'Respond quickly',
              desc: 'Enable Instant Auto-Submit for cases with strong evidence to meet processor deadlines',
              icon: Rocket
            },
            {
              title: 'Review low-confidence cases',
              desc: 'Manually review cases below your threshold - sometimes additional evidence can be added',
              icon: Eye
            },
            {
              title: 'Keep PMS integration active',
              desc: 'Ensure your property management system is connected for automatic evidence collection',
              icon: Settings
            },
            {
              title: 'Monitor analytics weekly',
              desc: 'Track trends and adjust your strategy based on win/loss patterns',
              icon: TrendingUp
            },
          ].map((practice, i) => (
            <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
              <div className="p-2 bg-green-100 rounded-lg">
                <practice.icon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium text-slate-800">{practice.title}</h4>
                <p className="text-sm text-slate-600">{practice.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'get-started',
    title: 'Get Started',
    subtitle: 'You\'re ready to go!',
    icon: CheckCircle,
    color: 'green',
    content: (
      <div className="space-y-4">
        <p className="text-slate-600">
          You now know everything you need to effectively use AccuDefend. Here's what to do next:
        </p>

        <div className="space-y-3 mt-6">
          <Link
            to="/"
            className="flex items-center justify-between p-4 bg-primary-50 rounded-xl border-2 border-primary-200 hover:bg-primary-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-600 rounded-lg">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-primary-800">Go to Dashboard</p>
                <p className="text-sm text-primary-600">Check your current status</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-primary-400" />
          </Link>

          <Link
            to="/cases?status=pending"
            className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200 hover:bg-yellow-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500 rounded-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-yellow-800">Review Pending Cases</p>
                <p className="text-sm text-yellow-600">See cases that need attention</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-yellow-400" />
          </Link>

          <Link
            to="/settings"
            className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-600 rounded-lg">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-slate-800">Configure Settings</p>
                <p className="text-sm text-slate-600">Customize AI behavior</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </Link>
        </div>

        <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium text-green-800">Need Help?</span>
          </div>
          <p className="text-sm text-green-700">
            You can return to this tutorial anytime from the sidebar navigation.
            For additional support, contact your account manager.
          </p>
        </div>
      </div>
    )
  }
]

function Tutorial() {
  const [currentStep, setCurrentStep] = useState(0)
  const step = TUTORIAL_STEPS[currentStep]

  const goNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const getColorClasses = (color) => {
    const colors = {
      primary: 'bg-primary-100 text-primary-600',
      blue: 'bg-blue-100 text-blue-600',
      green: 'bg-green-100 text-green-600',
      purple: 'bg-purple-100 text-purple-600',
      orange: 'bg-orange-100 text-orange-600',
      teal: 'bg-teal-100 text-teal-600',
      yellow: 'bg-yellow-100 text-yellow-600',
    }
    return colors[color] || colors.primary
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-primary-600" />
            Tutorial
          </h1>
          <p className="text-slate-500">Learn how to use AccuDefend effectively</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          Step {currentStep + 1} of {TUTORIAL_STEPS.length}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                i === currentStep
                  ? 'bg-primary-100 text-primary-700'
                  : i < currentStep
                  ? 'bg-green-50 text-green-700'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {i < currentStep ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">
                  {i + 1}
                </span>
              )}
              <span className="hidden sm:inline text-sm font-medium">{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Step Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${getColorClasses(step.color)}`}>
              <step.icon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{step.title}</h2>
              <p className="text-slate-500">{step.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6">
          {step.content}
        </div>

        {/* Navigation */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
            Previous
          </button>

          {currentStep < TUTORIAL_STEPS.length - 1 ? (
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Next
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <Link
              to="/"
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Check className="w-5 h-5" />
              Complete Tutorial
            </Link>
          )}
        </div>
      </div>

      {/* Quick Jump */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-500 mb-3">Jump to section:</p>
        <div className="flex flex-wrap gap-2">
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                i === currentStep
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Tutorial
