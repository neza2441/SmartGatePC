<?php

namespace App\Http\Controllers;

use App\Models\Computer;
use App\Models\User;
use App\Models\VerificationLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    public function students(): JsonResponse
    {
        $students = User::where('role', 'student')->withCount('computers')->orderBy('name')->get();

        return response()->json(['data' => $students]);
    }

    public function users(): JsonResponse
    {
        return response()->json([
            'data' => User::withCount('computers')->orderBy('name')->get(),
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'student_id' => ['nullable', 'required_if:role,student', 'string', 'max:40', 'unique:users,student_id'],
            'password' => ['required', 'string', 'min:12'],
            'role' => ['required', 'in:student,gate_officer,administrator'],
        ]);

        $user = User::create($data);

        return response()->json(['data' => $user], 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'student_id' => ['nullable', 'required_if:role,student', 'string', 'max:40', 'unique:users,student_id,'.$user->id],
            'role' => ['required', 'in:student,gate_officer,administrator'],
            'password' => ['nullable', 'string', 'min:12'],
        ]);

        if ($user->is(auth()->user()) && $data['role'] !== 'administrator') {
            abort(422, 'You cannot remove your own administrator role.');
        }

        if ($user->role === 'administrator' && $data['role'] !== 'administrator' && User::where('role', 'administrator')->count() <= 1) {
            abort(422, 'The last administrator role cannot be removed.');
        }

        if ($data['role'] !== 'student') {
            $data['student_id'] = null;
        }
        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        $user->update($data);
        $user->loadCount('computers');

        return response()->json(['data' => $user]);
    }

    public function destroyUser(Request $request, User $user): JsonResponse
    {
        if ($user->is($request->user())) {
            abort(422, 'You cannot delete your own administrator account.');
        }

        if ($user->role === 'administrator' && User::where('role', 'administrator')->count() <= 1) {
            abort(422, 'The last administrator account cannot be deleted.');
        }

        $user->delete();

        return response()->json(['message' => 'User account deleted.']);
    }

    public function storeStudent(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'student_id' => ['required', 'string', 'max:40', 'unique:users,student_id'],
            'password' => ['required', 'string', 'min:12'],
            'role' => ['sometimes', 'in:student,gate_officer,administrator'],
        ]);
        $user = User::create([...$data, 'role' => $data['role'] ?? 'student']);

        return response()->json(['data' => $user], 201);
    }

    public function logs(): JsonResponse
    {
        $logs = VerificationLog::with(['computer.owner', 'officer'])->latest('created_at')->limit(500)->get();

        return response()->json(['data' => $logs->map(fn (VerificationLog $log) => [
            'id' => $log->id,
            'student' => $log->computer?->owner?->name ?? 'Unknown device',
            'device' => $log->computer ? "{$log->computer->manufacturer} {$log->computer->model}" : 'Unregistered PC',
            'serial' => $log->computer?->serial_number ?? $log->identifier,
            'officer' => $log->officer?->name,
            'time' => $log->created_at?->format('h:i A'),
            'result' => match ($log->result) {
                'verified' => 'Verified',
                'pending_review' => 'Pending review',
                'rejected' => 'Rejected',
                default => 'Not registered',
            },
        ])]);
    }

    public function reports(): JsonResponse
    {
        return response()->json([
            'registeredPcs' => Computer::count(),
            'verifiedPcs' => Computer::where('status', 'verified')->count(),
            'pendingPcs' => Computer::where('status', 'pending_review')->count(),
            'studentsCovered' => User::where('role', 'student')->has('computers')->count(),
            'checksToday' => VerificationLog::whereDate('created_at', today())->count(),
            'unregisteredAttempts' => VerificationLog::where('result', 'not_registered')->count(),
            'activity' => VerificationLog::query()
                ->selectRaw('DATE(created_at) as day, result, COUNT(*) as total')
                ->where('created_at', '>=', now()->subDays(6)->startOfDay())
                ->groupBy('day', 'result')
                ->orderBy('day')
                ->get(),
        ]);
    }
}