// Na Windows bez okna konzole
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zapisnik_lib::run()
}
