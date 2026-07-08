import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Privacy: iOS has no equivalent of Android's FLAG_SECURE (screenshots can't be blocked outright),
    // but we CAN keep balances/addresses out of the app-switcher snapshot: blur the UI whenever the app
    // becomes inactive/backgrounded, and remove the blur when it returns to the foreground.
    private var privacyOverlay: UIVisualEffectView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        showPrivacyOverlay()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        hidePrivacyOverlay()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func showPrivacyOverlay() {
        guard let window = self.window, privacyOverlay == nil else { return }
        let overlay = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterialDark))
        overlay.frame = window.bounds
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(overlay)
        privacyOverlay = overlay
    }

    private func hidePrivacyOverlay() {
        privacyOverlay?.removeFromSuperview()
        privacyOverlay = nil
    }
}
