from django.urls import path

from .views import health, login, me, profile, register, scan_detail, scans

urlpatterns = [
    path('health/', health, name='health'),
    path('auth/register/', register, name='register'),
    path('auth/login/', login, name='login'),
    path('auth/me/', me, name='me'),
    path('profile/', profile, name='profile'),
    path('scans/', scans, name='scans'),
    path('scans/<int:scan_id>/', scan_detail, name='scan-detail'),
]
