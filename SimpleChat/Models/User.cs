using System.ComponentModel.DataAnnotations;

namespace SimpleChat.Models
{
    public class User
    {
        [Required(ErrorMessage = "Username is required")]
        [RegularExpression(@"^(?!\d+$)[a-zA-Z0-9_.-]{1,20}$", 
            ErrorMessage = "Name must be 1–20 characters, using only letters, numbers, ., _, or -, and not be only digits.")]

        public string Name { get; set; }
    }
}
