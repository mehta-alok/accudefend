/**
 * AccuDefend - Hotel Chargeback Defense System
 * Tutorial/Onboarding Component
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  FileText,
  Upload,
  Brain,
  Settings,
  CheckCircle,
  Target,
  Shield,
  Zap,
  HelpCircle,
  BarChart3,
  Mail,
  Link2
} from 'lucide-react';

const tutorialSteps = [
  {
    id: 'welcome',
    title: 'Welcome to AccuDefend',
    description: 'Your AI-powered chargeback defense system. This tutorial will guide you through the key features.',
    icon: Shield,
    image: null,
    tips: [
      'AccuDefend helps you fight chargebacks more effectively',
      'AI-powered analysis increases your win rate',
      'Automated evidence collection saves time'
    ]
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'The dashboard provides a real-time snapshot of your chargeback cases and key metrics.',
    icon: LayoutDashboard,
    tips: [
      'View total cases, win rates, and amount at risk',
      'Track urgent cases with approaching deadlines',
      'Monitor recovery summary and trends'
    ]
  },
  {
    id: 'cases',
    title: 'Managing Cases',
    description: 'View and manage all your chargeback cases in one place.',
    icon: FileText,
    tips: [
      'Filter cases by status, date, or property',
      'Click any case to view full details',
      'Track case timeline and history'
    ]
  },
  {
    id: 'evidence',
    title: 'Uploading Evidence',
    description: 'Gather and upload evidence to strengthen your dispute response.',
    icon: Upload,
    tips: [
      'Upload ID scans, signatures, folios, and more',
      'Required evidence is marked in red',
      'Recommended evidence helps boost win probability'
    ]
  },
  {
    id: 'ai-analysis',
    title: 'AI Analysis',
    description: 'Our AI analyzes each case and provides recommendations based on evidence and historical data.',
    icon: Brain,
    tips: [
      'Confidence scores indicate win probability',
      'AI recommendations guide your next steps',
      'Fraud indicators highlight risk factors'
    ]
  },
  {
    id: 'pms-integration',
    title: 'PMS Integration',
    description: 'Connect directly to your Property Management System to automatically fetch evidence for disputes.',
    icon: Link2,
    tips: [
      'Connect to 12+ supported PMS systems (Opera, Mews, AutoClerk, etc.)',
      'Search reservations and fetch evidence with one click',
      'Two-way sync keeps data updated in real-time'
    ]
  },
  {
    id: 'settings',
    title: 'Configuration',
    description: 'Admins can configure AI thresholds, evidence weights, and notification settings.',
    icon: Settings,
    tips: [
      'Adjust AI confidence thresholds',
      'Configure evidence packet templates',
      'Set up email notifications'
    ]
  },
  {
    id: 'complete',
    title: 'You\'re Ready!',
    description: 'You now know the basics of AccuDefend. Start managing your chargebacks more effectively!',
    icon: CheckCircle,
    tips: [
      'Access help anytime from the ? icon',
      'Contact support for additional assistance',
      'Check settings to customize your experience'
    ]
  }
];

export function Tutorial({ isOpen, onClose, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showTutorial, setShowTutorial] = useState(isOpen);

  useEffect(() => {
    setShowTutorial(isOpen);
  }, [isOpen]);

  if (!showTutorial) return null;

  const step = tutorialSteps[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('accudefend_tutorial_complete', 'true');
    setShowTutorial(false);
    onComplete?.();
    onClose?.();
  };

  const handleSkip = () => {
    localStorage.setItem('accudefend_tutorial_complete', 'true');
    setShowTutorial(false);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
                Step {currentStep + 1} of {tutorialSteps.length}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-2xl font-bold">{step.title}</h2>
          <p className="mt-2 text-blue-100">{step.description}</p>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tutorialSteps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-3">
            {step.tips.map((tip, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="p-1 bg-blue-100 rounded">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-sm text-gray-700">{tip}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Skip tutorial
          </button>
          <div className="flex items-center gap-3">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="btn-secondary"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="btn-primary"
            >
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
            </button>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="px-6 pb-4 bg-gray-50 flex justify-center gap-2">
          {tutorialSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStep ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HelpButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-40"
      title="Help & Tutorial"
    >
      <HelpCircle className="w-6 h-6" />
    </button>
  );
}

export function HelpPanel({ isOpen, onClose, onStartTutorial }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  const helpTopics = [
    {
      title: 'Getting Started',
      items: [
        { label: 'Take the Tutorial', action: onStartTutorial, highlight: true, icon: HelpCircle },
        { label: 'Dashboard Overview', link: '/', icon: LayoutDashboard },
        { label: 'Managing Cases', link: '/cases', icon: FileText },
        { label: 'PMS Integration', link: '/pms', icon: Link2 },
        { label: 'Analytics & Reports', link: '/analytics', icon: BarChart3 }
      ]
    },
    {
      title: 'Case Management',
      items: [
        { label: 'Creating a New Case', info: 'Cases are created automatically from webhook events or manually via API', icon: FileText },
        { label: 'Uploading Evidence', info: 'Go to case details and use the Evidence tab to upload files', icon: Upload },
        { label: 'AI Recommendations', info: 'AI analyzes evidence and provides confidence scores', icon: Brain }
      ]
    },
    {
      title: 'PMS Integration',
      items: [
        { label: 'Connect Your PMS', link: '/pms', info: 'Link to Opera, Mews, AutoClerk, and 9 more systems', icon: Link2 },
        { label: 'Search & Fetch Evidence', link: '/pms', info: 'Find reservations and download folios, signatures, ID scans', icon: FileText },
        { label: 'Two-Way Sync', info: 'Real-time sync pushes chargeback alerts to your PMS', icon: Upload }
      ]
    },
    {
      title: 'Admin Settings',
      items: [
        { label: 'Defense Configuration', link: '/settings', info: 'AI thresholds & evidence requirements', icon: Shield },
        { label: 'Email Notifications', link: '/settings', info: 'Configure alert recipients', icon: Mail }
      ]
    },
    {
      title: 'Quick Tips',
      items: [
        { label: 'Keyboard Shortcuts', info: 'Press ? anywhere to open help' },
        { label: 'Urgent Cases', info: 'Cases due within 7 days appear in the Urgent section' },
        { label: 'Win Rate', info: 'Calculated from resolved cases (Won / (Won + Lost))' }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end bg-black/30">
      <div className="bg-white w-full sm:w-96 h-[80vh] sm:h-full sm:max-h-[calc(100vh-2rem)] sm:mr-4 sm:my-4 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <HelpCircle className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Help & Support</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {helpTopics.map((topic, index) => (
            <div key={index}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {topic.title}
              </h3>
              <div className="space-y-2">
                {topic.items.map((item, itemIndex) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={itemIndex}
                      className={`p-3 rounded-lg ${
                        item.highlight
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      {item.action ? (
                        <button
                          onClick={item.action}
                          className={`w-full text-left flex items-center gap-3 font-medium ${
                            item.highlight ? 'text-blue-700' : 'text-gray-900'
                          }`}
                        >
                          {Icon && <Icon className="w-4 h-4" />}
                          <span>{item.label}</span>
                          <ChevronRight className="w-4 h-4 ml-auto" />
                        </button>
                      ) : item.link ? (
                        <button
                          onClick={() => handleNavigate(item.link)}
                          className="w-full text-left flex items-start gap-3 group"
                        >
                          {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 group-hover:text-blue-600" />}
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 group-hover:text-blue-600">{item.label}</p>
                            {item.info && (
                              <p className="text-xs text-gray-500 mt-0.5">{item.info}</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600 mt-0.5" />
                        </button>
                      ) : (
                        <div className="flex items-start gap-3">
                          {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5" />}
                          <div>
                            <p className="font-medium text-gray-900">{item.label}</p>
                            {item.info && (
                              <p className="text-xs text-gray-500 mt-0.5">{item.info}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-500 text-center">
            Need more help?{' '}
            <a href="mailto:support@accudefend.com" className="text-blue-600 hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Tutorial;
