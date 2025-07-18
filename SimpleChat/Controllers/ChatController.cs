using Microsoft.AspNetCore.Mvc;
using SimpleChat.Models;

namespace SimpleChat.Controllers
{
    public class ChatController : Controller
    {
        [Route("/")]
        public IActionResult Landing()
        {
            return View();
        }

        [HttpPost]
        [Route("/chat")]
        public IActionResult ChatPage(User user)
        {
            if (!ModelState.IsValid)
            {
                return View("Landing", user);
            }
            return View(user);
        }

        [HttpPost]
        public IActionResult disconnectRedirect()
        {
            return RedirectToAction("Landing");
        }
    }
}
